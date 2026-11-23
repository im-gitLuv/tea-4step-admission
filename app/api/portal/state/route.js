// ─────────────────────────────────────────────────────────────
// GET /api/portal/state — Estado completo del portal (Estrato 2).
//
// Una sola llamada le da a /portal todo lo que necesita renderizar:
// tenant (brand), funnel, pasos + módulos (gated marcados con
// revealed), formularios con preguntas y progreso derivado.
// Autenticado SOLO por la cookie del magic link.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getParticipantFromRequest, loadPortalState } from "@/lib/funnel";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const participant = await getParticipantFromRequest(request);
  if (!participant) {
    return NextResponse.json({ success: false, message: "Sin sesión." }, { status: 401 });
  }

  try {
    const state = await loadPortalState(participant);
    if (!state) {
      return NextResponse.json(
        { success: false, message: "No hay funnel publicado para tu acceso." },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, state });
  } catch (e) {
    console.error("[/api/portal/state]", e?.message || e);
    return NextResponse.json(
      { success: false, message: "Error del servidor." },
      { status: 500 }
    );
  }
}
