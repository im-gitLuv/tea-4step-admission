// ─────────────────────────────────────────────────────────────
// GET /api/admin/participants/[id] — Ficha completa (Estrato 3):
// datos, progreso, últimos 60 eventos, respuestas de formularios,
// citas y tokens de acceso (sin material sensible).
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getAdminFromRequest, adminUnauthorized } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return adminUnauthorized();

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Supabase no configurado." }, { status: 503 });

  const { id } = params || {};
  try {
    const { data: participant, error } = await sb
      .from("participants")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", admin.tenantId)
      .maybeSingle();
    if (error) throw error;
    if (!participant) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

    // Nombre del funnel del participante (para identificar el proceso en la ficha)
    let funnel = null;
    if (participant.funnel_id) {
      const { data: f } = await sb
        .from("funnels")
        .select("id, title, status")
        .eq("id", participant.funnel_id)
        .maybeSingle();
      funnel = f ? { id: f.id, title: f.title, status: f.status } : null;
    }

    // Pasos del funnel del participante (para rotular progreso)
    const { data: steps } = participant.funnel_id
      ? await sb
          .from("steps")
          .select("id, position, tab_label, side_title")
          .eq("funnel_id", participant.funnel_id)
          .order("position", { ascending: true })
      : { data: [] };

    const [progress, events, responses, appointments, tokens] = await Promise.all([
      sb.from("step_progress").select("*").eq("participant_id", id),
      sb.from("event_log").select("*").eq("participant_id", id).order("created_at", { ascending: false }).limit(60),
      sb.from("form_responses").select("*").eq("participant_id", id).order("submitted_at", { ascending: false }),
      sb.from("appointments").select("*").eq("participant_id", id).order("updated_at", { ascending: false }),
      sb.from("access_tokens").select("id, delivery, expires_at, used_at, revoked_at, created_at").eq("participant_id", id).order("created_at", { ascending: false }),
    ]);

    // Respuestas con preguntas
    const responseIds = (responses.data || []).map((r) => r.id);
    const { data: answers } = await sb
      .from("form_answers")
      .select("response_id, question_id, value")
      .in("response_id", responseIds.length ? responseIds : ["00000000-0000-0000-0000-000000000000"]);
    const questionIds = [...new Set((answers || []).map((a) => a.question_id))];
    const { data: questions } = await sb
      .from("form_questions")
      .select("id, label, position")
      .in("id", questionIds.length ? questionIds : ["00000000-0000-0000-0000-000000000000"]);
    const qLabel = {};
    (questions || []).forEach((q) => (qLabel[q.id] = q.label));

    const responsesOut = (responses.data || []).map((r) => ({
      ...r,
      answers: (answers || [])
        .filter((a) => a.response_id === r.id)
        .map((a) => ({ label: qLabel[a.question_id] || a.question_id, value: a.value })),
    }));

    return NextResponse.json({
      ok: true,
      participant,
      funnel,
      steps: steps || [],
      progress: progress.data || [],
      events: events.data || [],
      responses: responsesOut,
      appointments: appointments.data || [],
      tokens: tokens.data || [],
    });
  } catch (e) {
    console.error("[/api/admin/participants/[id]]", e?.message || e);
    return NextResponse.json({ error: "Error del servidor." }, { status: 500 });
  }
}
