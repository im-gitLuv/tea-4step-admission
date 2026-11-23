// ─────────────────────────────────────────────────────────────
// GET /api/admin/overview — KPIs del dashboard (Estrato 3).
// Todo scoping al tenant del admin autenticado.
//
// v2.1: TODAS las consultas verifican `error` explícitamente.
// Si una consulta falla, se registra en `problems[]` (y en la
// consola del servidor) en lugar de mostrar un 0 silencioso.
// Además, `participants_total` usa como respaldo el listado de ids
// (misma forma de consulta que ya funciona en /api/admin/participants).
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

  try {
    const tenantId = admin.tenantId;
    const problems = [];

    /** Count exacto con error controlado → número o null (y problem registrado). */
    async function headCount(table, extra) {
      let q = sb.from(table).select("id", { count: "exact", head: true });
      if (extra) q = extra(q);
      const { count, error } = await q;
      if (error) {
        problems.push(`Conteo "${table}": ${error.message}`);
        console.error(`[/api/admin/overview] count ${table}:`, error.message);
        return null;
      }
      return typeof count === "number" ? count : null;
    }

    // Funnel principal del tenant (para el funnel por paso)
    const { data: funnel, error: funnelErr } = await sb
      .from("funnels")
      .select("id, title")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (funnelErr) {
      problems.push(`Funnel: ${funnelErr.message}`);
      console.error("[/api/admin/overview] funnel:", funnelErr.message);
    }

    let steps = [];
    if (funnel) {
      const { data: s, error: stepsErr } = await sb
        .from("steps")
        .select("id, position, tab_label")
        .eq("funnel_id", funnel.id)
        .order("position", { ascending: true });
      if (stepsErr) {
        problems.push(`Pasos: ${stepsErr.message}`);
        console.error("[/api/admin/overview] steps:", stepsErr.message);
      }
      steps = s || [];
    }

    // Participantes — counts con error controlado
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const total = await headCount("participants", (q) => q.eq("tenant_id", tenantId));
    const blocked = await headCount(
      "participants",
      (q) => q.eq("tenant_id", tenantId).eq("status", "blocked")
    );
    const active7d = await headCount(
      "participants",
      (q) => q.eq("tenant_id", tenantId).gte("last_seen_at", weekAgo)
    );

    // Ids de participantes (también respaldo del total, misma consulta
    // que funciona en el listado de /admin/participantes)
    const { data: participantIdRows, error: idsErr } = await sb
      .from("participants")
      .select("id")
      .eq("tenant_id", tenantId);
    if (idsErr) {
      problems.push(`Listado de participantes: ${idsErr.message}`);
      console.error("[/api/admin/overview] participant ids:", idsErr.message);
    }
    const participantIds = (participantIdRows || []).map((p) => p.id);

    // El count exacto manda; si falló o vino raro, el listado de ids respalda.
    const totalFinal =
      typeof total === "number" ? Math.max(total, participantIds.length) : participantIds.length;

    // Completado por paso
    const perStep = [];
    for (const st of steps) {
      const { count, error } = await sb
        .from("step_progress")
        .select("id", { count: "exact", head: true })
        .eq("step_id", st.id)
        .eq("status", "completed");
      if (error) {
        problems.push(`Progreso paso ${st.position}: ${error.message}`);
        console.error(`[/api/admin/overview] step_progress ${st.position}:`, error.message);
      }
      perStep.push({ position: st.position, tab_label: st.tab_label, completed: error ? 0 : count || 0 });
    }

    // Otros KPIs (ids locales para filtrar por tenant sin RPC)
    const NONE = ["00000000-0000-0000-0000-000000000000"];
    const { data: formIdRows, error: formsErr } = await sb
      .from("forms")
      .select("id")
      .eq("tenant_id", tenantId);
    if (formsErr) {
      problems.push(`Formularios: ${formsErr.message}`);
      console.error("[/api/admin/overview] forms:", formsErr.message);
    }
    const formIds = (formIdRows || []).map((f) => f.id);
    const formsSubmitted = formIds.length
      ? await headCount("form_responses", (q) => q.in("form_id", formIds))
      : 0;
    const apptsConfirmed = participantIds.length
      ? await headCount(
          "appointments",
          (q) => q.in("participant_id", participantIds).eq("status", "confirmed")
        )
      : 0;
    const queuePending = await headCount(
      "outbound_queue",
      (q) => q.eq("tenant_id", tenantId).eq("status", "pending")
    );
    const queueFailed = await headCount(
      "outbound_queue",
      (q) => q.eq("tenant_id", tenantId).in("status", ["failed", "dead"])
    );

    // Actividad reciente (últimos 8 participantes con actividad)
    const { data: recent, error: recentErr } = await sb
      .from("participants")
      .select("id, email, first_name, last_name, status, created_at, last_seen_at, funnel_id")
      .eq("tenant_id", tenantId)
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(8);
    if (recentErr) {
      problems.push(`Actividad reciente: ${recentErr.message}`);
      console.error("[/api/admin/overview] recent:", recentErr.message);
    }

    return NextResponse.json({
      ok: true,
      kpis: {
        participants_total: totalFinal,
        participants_blocked: blocked || 0,
        participants_active_7d: active7d || 0,
        forms_submitted: formsSubmitted || 0,
        appointments_confirmed: apptsConfirmed || 0,
        queue_pending: queuePending || 0,
        queue_failed: queueFailed || 0,
      },
      funnel: funnel ? { id: funnel.id, title: funnel.title } : null,
      per_step: perStep,
      recent: recent || [],
      problems,
    });
  } catch (e) {
    console.error("[/api/admin/overview]", e?.message || e);
    return NextResponse.json({ error: "Error del servidor." }, { status: 500 });
  }
}
