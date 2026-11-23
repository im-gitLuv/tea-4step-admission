// ─────────────────────────────────────────────────────────────
// /api/admin/participants — Lista y estado de participantes (Estrato 3).
//
// GET  ?q=busqueda&limit=50 → lista con progreso derivado (paso actual)
// PATCH {id, status: 'active'|'blocked'} → bloquear / desbloquear
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getAdminFromRequest, adminUnauthorized } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return adminUnauthorized();

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Supabase no configurado." }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const limit = Math.min(Number(searchParams.get("limit") || 50), 200);

  try {
    let query = sb
      .from("participants")
      .select("id, email, first_name, last_name, phone, source, status, crm_contact_id, created_at, last_seen_at, funnel_id")
      .eq("tenant_id", admin.tenantId)
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (q) query = query.or(`email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`);

    const { data: rows, error } = await query;
    if (error) throw error;

    // Progreso por participante: mapa step_id → posición del funnel del tenant
    const { data: steps } = await sb
      .from("steps")
      .select("id, position, funnel_id")
      .in(
        "funnel_id",
        [...new Set((rows || []).map((r) => r.funnel_id).filter(Boolean))].length
          ? [...new Set((rows || []).map((r) => r.funnel_id).filter(Boolean))]
          : ["00000000-0000-0000-0000-000000000000"]
      );
    const posByStep = {};
    (steps || []).forEach((s) => (posByStep[s.id] = s.position));
    const totalByFunnel = {};
    (steps || []).forEach((s) => {
      totalByFunnel[s.funnel_id] = Math.max(totalByFunnel[s.funnel_id] || 0, s.position);
    });

    const ids = (rows || []).map((r) => r.id);
    const { data: progress } = await sb
      .from("step_progress")
      .select("participant_id, step_id, status")
      .in("participant_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
      .eq("status", "completed");

    const completedByP = {};
    (progress || []).forEach((r) => {
      const pos = posByStep[r.step_id];
      if (!pos) return;
      (completedByP[r.participant_id] = completedByP[r.participant_id] || []).push(pos);
    });

    const out = (rows || []).map((r) => {
      const completed = (completedByP[r.id] || []).sort((a, b) => a - b);
      const total = totalByFunnel[r.funnel_id] || 0;
      let current = 1;
      for (let p = 1; p <= total; p++) {
        if (!completed.includes(p)) { current = p; break; }
        current = total;
      }
      return { ...r, completed_positions: completed, current_step: current, funnel_total: total };
    });

    return NextResponse.json({ ok: true, participants: out });
  } catch (e) {
    console.error("[/api/admin/participants]", e?.message || e);
    return NextResponse.json({ error: "Error del servidor." }, { status: 500 });
  }
}

export async function PATCH(request) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return adminUnauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }
  const { id, status } = body || {};
  if (!id || !["active", "blocked"].includes(status)) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Supabase no configurado." }, { status: 503 });

  try {
    // Verificar que el participante pertenece al tenant del admin
    const { data: p } = await sb.from("participants").select("id, tenant_id").eq("id", id).maybeSingle();
    if (!p || p.tenant_id !== admin.tenantId) {
      return NextResponse.json({ error: "Participante no encontrado." }, { status: 404 });
    }
    const { error } = await sb.from("participants").update({ status }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/admin/participants PATCH]", e?.message || e);
    return NextResponse.json({ error: "Error del servidor." }, { status: 500 });
  }
}
