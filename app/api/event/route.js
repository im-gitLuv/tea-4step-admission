// ─────────────────────────────────────────────────────────────
// POST /api/event — bitácora de eventos + MOTOR DE TRIGGERS (Estrato 2).
//
// Registra el evento en event_log y luego evalúa los triggers del
// funnel para ese evento. Las acciones (reveal_module, complete_step,
// send_webhook, crm_*) se aplican en el servidor y `effects` vuelve
// al cliente para que la UI reaccione al instante (p. ej. revelar el
// formulario cuando termina el video).
//
// Autenticado SOLO por cookie de sesión; el paso viene como posición
// numérica 1..N y se resuelve contra la tabla steps del funnel.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { readSessionFromRequest } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logParticipantEvent, markStepCompleted } from "@/lib/progress";
import { fireTriggers } from "@/lib/triggers";
import { drainOutboundQueue } from "@/lib/crm";

const ALLOWED = new Set([
  "step_entered",
  "video_started",
  "video_progress",
  "video_ended",
  "module_viewed",
  "button_clicked",
  "download_clicked",
  "form_viewed",
]);

export async function POST(request) {
  const session = readSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { type, step, moduleId, value } = body || {};
  if (!ALLOWED.has(type)) {
    return NextResponse.json({ ok: false, message: "Tipo no permitido" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false }, { status: 503 });

  try {
    const { data: participant, error } = await sb
      .from("participants")
      .select("*")
      .eq("id", session.participantId)
      .maybeSingle();
    if (error) throw error;
    if (!participant || participant.status === "blocked") {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // 1) Registrar el evento (step position → step_id)
    const stepPosition = Number(step) || null;
    await logParticipantEvent(participant, type, {
      stepPosition,
      value: value && typeof value === "object" ? value : {},
    });

    // 2) Resolver el step_id para el alcance de los triggers
    let stepId = null;
    if (stepPosition && participant.funnel_id) {
      const { data: st } = await sb
        .from("steps")
        .select("id")
        .eq("funnel_id", participant.funnel_id)
        .eq("position", stepPosition)
        .maybeSingle();
      stepId = st?.id || null;
    }

    // 3) Motor de triggers
    const { effects } = await fireTriggers({
      participant,
      eventType: type,
      stepId,
      moduleId: moduleId || null,
      value: value && typeof value === "object" ? value : {},
    });

    // 4) Drenaje best-effort de la cola CRM (fire-and-forget, no bloquea)
    if (effects.some((e) => e.action_type === "crm_tag" || e.action_type === "crm_custom_field" || e.action_type === "send_webhook")) {
      drainOutboundQueue(10).catch(() => {});
    }

    return NextResponse.json({ ok: true, effects });
  } catch (e) {
    console.error("[/api/event]", e?.message || e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// completar paso por API explícita (botón "Continuar" del runtime modular)
export async function PUT(request) {
  const session = readSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const { step } = body || {};
  const stepPosition = Number(step);
  if (!stepPosition) {
    return NextResponse.json({ ok: false, message: "Falta step" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false }, { status: 503 });

  try {
    const { data: participant, error } = await sb
      .from("participants")
      .select("*")
      .eq("id", session.participantId)
      .maybeSingle();
    if (error) throw error;
    if (!participant || participant.status === "blocked") {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    await markStepCompleted(participant, stepPosition);
    return NextResponse.json({ ok: true, completed: stepPosition });
  } catch (e) {
    console.error("[/api/event PUT]", e?.message || e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
