// ─────────────────────────────────────────────────────────────
// POST /api/step-complete — v1 + Estrato 1 (dual-write).
//
//   · v1 (sin cookie de sesión): comportamiento idéntico al original —
//     tag paso_N_completado en GHL (fire-and-forget).
//   · v2 (sesión de magic link): además escribe step_progress + evento
//     step_completed en Supabase. La cookie es la fuente del participante
//     (nunca el body — brecha B4). Un fallo de Supabase no rompe nada.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { addTags } from "@/lib/ghl";
import { STEP_TAGS } from "@/lib/constants";
import { readSessionFromRequest } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { markStepCompleted } from "@/lib/progress";

export async function POST(request) {
  try {
    const { contactId, step } = await request.json();

    if (!STEP_TAGS[step]) {
      return NextResponse.json(
        { success: false, message: "Datos inválidos." },
        { status: 400 }
      );
    }

    // ── v2: sesión de magic link → progreso en Supabase ──────────
    let synced = false;
    const session = readSessionFromRequest(request);
    if (session) {
      const sb = getSupabaseAdmin();
      if (sb) {
        try {
          const { data: participant, error } = await sb
            .from("participants")
            .select("id, funnel_id, status")
            .eq("id", session.participantId)
            .maybeSingle();
          if (error) throw error;
          if (participant && participant.status !== "blocked") {
            await markStepCompleted(participant, Number(step));
            synced = true;
          }
        } catch (e) {
          console.error("[/api/step-complete][supabase]", e?.message || e);
        }
      }
    }

    // ── v1: tag en GHL (fire-and-forget, igual que siempre) ──────
    // El id de contacto puede venir del login v1 O del participante v2
    // enlazado a GHL (crm_contact_id viaja dentro de contact.id).
    let tag = null;
    let warning = null;
    if (contactId) {
      try {
        await addTags(contactId, [STEP_TAGS[step]]);
        tag = STEP_TAGS[step];
      } catch (err) {
        console.error("[/api/step-complete][ghl]", err);
        warning = "tag_failed";
      }
    }

    return NextResponse.json({ success: true, tag, synced, warning });
  } catch (err) {
    console.error("[/api/step-complete]", err);
    // No bloqueamos al lead: el portal sigue funcionando.
    return NextResponse.json({ success: false, warning: "tag_failed" });
  }
}
