// ─────────────────────────────────────────────────────────────
// /api/appointment — v1 + v2 BIG BANG (doble modo).
//
// GET:  · con ?contactId= → v1 original (consulta fresca GHL scoped al
//         calendario Sales Call).
//       · sin contactId (v2, cookie de sesión) → si el participante tiene
//         crm_contact_id consulta GHL; si no, busca en la tabla
//         appointments (scheduler nativo/manual).
//
// POST: · v1 (contactId): confirmar en GHL es crítico + tag salescall-confirmed.
//       · v2 (cookie): espejo en appointments + MOTOR DE TRIGGERS
//         (appointment_confirmed → reveal/complete/webhook) + tag CRM
//         vía outbound_queue (no bloqueante) + completa el paso si el
//         módulo lo pide (complete_on_confirm ≠ false).
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import {
  getNextAppointment,
  confirmAppointment,
  addTags,
} from "../../../lib/ghl";
import { readSessionFromRequest } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logParticipantEvent, markStepCompleted } from "@/lib/progress";
import { fireTriggers } from "@/lib/triggers";
import { enqueueOutbound, drainOutboundQueue } from "@/lib/crm";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const contactId = searchParams.get("contactId");

  // ── v1: consulta fresca por contactId de GHL ──
  if (contactId) {
    try {
      const appt = await getNextAppointment(contactId);
      return NextResponse.json({
        id: appt?.id || null,
        startTime: appt?.startTime || null,
      });
    } catch (e) {
      console.error("[api/appointment GET] error:", e);
      return NextResponse.json({ id: null, startTime: null });
    }
  }

  // ── v2: por sesión (GHL si hay contacto enlazado; si no, tabla local) ──
  const session = readSessionFromRequest(request);
  const sb = getSupabaseAdmin();
  if (!session || !sb) {
    return NextResponse.json({ id: null, startTime: null });
  }

  try {
    const { data: participant } = await sb
      .from("participants")
      .select("id, crm_contact_id, tenant_id, funnel_id")
      .eq("id", session.participantId)
      .maybeSingle();
    if (!participant) return NextResponse.json({ id: null, startTime: null });

    if (participant.crm_contact_id) {
      try {
        const appt = await getNextAppointment(participant.crm_contact_id);
        if (appt) return NextResponse.json({ id: appt.id, startTime: appt.startTime });
      } catch (_) {
        // GHL falla → seguimos con la tabla local
      }
    }

    const { data: row } = await sb
      .from("appointments")
      .select("external_id, start_time")
      .eq("participant_id", participant.id)
      .in("status", ["pending", "confirmed"])
      .order("start_time", { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      id: row?.external_id || null,
      startTime: row?.start_time || null,
    });
  } catch (e) {
    console.error("[api/appointment GET][v2]", e?.message || e);
    return NextResponse.json({ id: null, startTime: null });
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const { appointmentId, contactId, moduleId } = body || {};

  const session = readSessionFromRequest(request);
  const sb = getSupabaseAdmin();

  // ════════ v2: espejo + triggers + cola CRM ════════
  if (session && sb) {
    try {
      const { data: participant, error } = await sb
        .from("participants")
        .select("*")
        .eq("id", session.participantId)
        .maybeSingle();
      if (error) throw error;

      if (participant && participant.status !== "blocked") {
        // Módulo scheduler (para el paso y complete_on_confirm)
        let stepId = null;
        let stepPosition = null;
        let completeOnConfirm = true;
        if (moduleId) {
          const { data: mod } = await sb
            .from("modules")
            .select("id, step_id, config, steps!inner(funnel_id, position)")
            .eq("id", moduleId)
            .maybeSingle();
          if (mod && mod.steps?.funnel_id === participant.funnel_id) {
            stepId = mod.step_id;
            stepPosition = mod.steps?.position || null;
            completeOnConfirm = mod.config?.complete_on_confirm !== false;
          }
        }

        await sb
          .from("appointments")
          .upsert(
            {
              participant_id: participant.id,
              provider: "ghl",
              external_id: appointmentId || null,
              calendar_id: "DX1pbtzm6YUeytHYMjzW",
              status: "confirmed",
              confirmed_at: new Date().toISOString(),
            },
            { onConflict: "participant_id,provider,external_id", ignoreDuplicates: false }
          );

        await logParticipantEvent(participant, "appointment_confirmed", {
          stepPosition,
          value: { appointment_id: appointmentId || null, provider: "ghl" },
        });

        // Motor de triggers (appointment_confirmed)
        const { effects } = await fireTriggers({
          participant,
          eventType: "appointment_confirmed",
          stepId,
          moduleId: moduleId || null,
          value: { appointment_id: appointmentId || null },
        });

        if (completeOnConfirm && stepPosition) {
          await markStepCompleted(participant, stepPosition);
          if (!effects.some((e) => e.action_type === "complete_step" && e.step_position === stepPosition)) {
            effects.push({ action_type: "complete_step", step_position: stepPosition });
          }
        }

        // Tag CRM vía cola (no bloqueante)
        const { data: integ } = await sb
          .from("crm_integrations")
          .select("tag_mapping")
          .eq("tenant_id", participant.tenant_id)
          .eq("provider", "ghl")
          .eq("active", true)
          .maybeSingle();
        if (integ) {
          const tag = (integ.tag_mapping || {}).appointment_confirmed || "salescall-confirmed";
          await enqueueOutbound({
            tenantId: participant.tenant_id,
            participantId: participant.id,
            kind: "ghl_tag",
            payload: { tag, email: participant.email, crm_contact_id: participant.crm_contact_id || null },
          });
          drainOutboundQueue(10).catch(() => {});
        }
      }
    } catch (e) {
      // Best-effort: la cita ya quedará confirmada en GHL si aplica.
      console.error("[api/appointment POST][v2]", e?.message || e);
    }
  }

  // ════════ Confirmación en GHL ════════
  if (appointmentId) {
    // 1) Crítico: cambia el estado real de la cita (v1 y v2 por igual —
    //    el calendario de Sales Call sigue siendo la verdad operativa).
    try {
      await confirmAppointment(appointmentId);
    } catch (e) {
      console.error("[api/appointment POST] error confirmando cita:", e);
      return NextResponse.json(
        { error: "No pudimos confirmar tu cita. Intenta de nuevo." },
        { status: 502 }
      );
    }

    // 2) Importante pero no bloqueante: tag salescall-confirmed (v1 inline).
    if (contactId) {
      try {
        await addTags(contactId, ["salescall-confirmed"]);
      } catch (e) {
        console.error(
          "[api/appointment POST] tag salescall-confirmed falló (no crítico):",
          e
        );
      }
    }
  } else if (!session) {
    // v1 sin appointmentId → error (comportamiento original).
    return NextResponse.json({ error: "Falta appointmentId." }, { status: 400 });
  }
  // v2 sin appointmentId: el espejo ya registró la intención de confirmación.

  return NextResponse.json({ ok: true, stored: session && sb ? "supabase" : "ghl" });
}
