// ─────────────────────────────────────────────────────────────
// GET /api/me — identidad + progreso del participante (Estrato 1, E1c).
//
// Autenticado por la cookie de sesión del magic link (nunca por datos
// del body — corrige la brecha B4). El portal lo usa para rehidratar
// el estado cuando no hay sessionStorage (pestaña nueva / tras cerrar),
// de modo que el progreso sobrevive al cierre de la pestaña.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { readSessionFromRequest } from "@/lib/session";
import { getSupabaseAdmin, sbSafe } from "@/lib/supabase";
import { getProgressFor, toContactShape } from "@/lib/progress";

export async function GET(request) {
  const session = readSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ success: false, message: "Sin sesión." }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return NextResponse.json(
      { success: false, message: "Supabase no configurado." },
      { status: 503 }
    );
  }

  try {
    const { data: participant, error } = await sb
      .from("participants")
      .select("*")
      .eq("id", session.participantId)
      .maybeSingle();

    if (error) throw error;
    if (!participant || participant.status === "blocked") {
      return NextResponse.json(
        { success: false, message: "Sesión no válida." },
        { status: 401 }
      );
    }

    const progress = (await getProgressFor(participant)) || {
      completed: [],
      current: 1,
    };

    // Última actividad (best-effort)
    await sbSafe("me_seen", (s) =>
      s
        .from("participants")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", participant.id)
    );

    return NextResponse.json({
      success: true,
      contact: toContactShape(participant),
      progress,
      participantId: participant.id,
    });
  } catch (e) {
    console.error("[/api/me]", e?.message || e);
    return NextResponse.json(
      { success: false, message: "Error del servidor." },
      { status: 500 }
    );
  }
}
