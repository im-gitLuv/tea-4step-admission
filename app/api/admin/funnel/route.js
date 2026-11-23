// ─────────────────────────────────────────────────────────────
// GET /api/admin/funnel — Árbol completo para el editor (Estrato 3):
// funnels del tenant + pasos + módulos + triggers + formularios con
// preguntas + assets. ?funnel_id= opcional para seleccionar funnel.
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
  const requested = searchParams.get("funnel_id");

  try {
    const tenantId = admin.tenantId;
    const { data: funnels, error: eF } = await sb
      .from("funnels")
      .select("id, title, slug, status, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });
    if (eF) throw eF;

    const funnel = requested
      ? (funnels || []).find((f) => f.id === requested)
      : (funnels || [])[0] || null;
    if (!funnel) {
      return NextResponse.json({ ok: true, funnels: funnels || [], funnel: null, steps: [], forms: [], assets: [] });
    }

    const { data: steps } = await sb
      .from("steps")
      .select("*")
      .eq("funnel_id", funnel.id)
      .order("position", { ascending: true });

    const stepIds = (steps || []).map((s) => s.id);
    const { data: modules } = await sb
      .from("modules")
      .select("*")
      .in("step_id", stepIds.length ? stepIds : ["00000000-0000-0000-0000-000000000000"])
      .is("deleted_at", null)
      .order("position", { ascending: true });

    const { data: triggers } = await sb
      .from("triggers")
      .select("*")
      .in("step_id", stepIds.length ? stepIds : ["00000000-0000-0000-0000-000000000000"])
      .order("created_at", { ascending: true });

    const { data: forms } = await sb
      .from("forms")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });
    const formIds = (forms || []).map((f) => f.id);
    const { data: questions } = await sb
      .from("form_questions")
      .select("*")
      .in("form_id", formIds.length ? formIds : ["00000000-0000-0000-0000-000000000000"])
      .order("position", { ascending: true });

    const { data: assets } = await sb
      .from("tenant_assets")
      .select("id, kind, name, url")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true });

    // Anidar módulos y triggers dentro de cada paso
    const stepsOut = (steps || []).map((s) => ({
      ...s,
      modules: (modules || []).filter((m) => m.step_id === s.id),
      triggers: (triggers || []).filter((t) => t.step_id === s.id),
    }));

    const formsOut = (forms || []).map((f) => ({
      ...f,
      questions: (questions || []).filter((q) => q.form_id === f.id),
    }));

    return NextResponse.json({
      ok: true,
      funnels: funnels || [],
      funnel,
      steps: stepsOut,
      forms: formsOut,
      assets: assets || [],
    });
  } catch (e) {
    console.error("[/api/admin/funnel]", e?.message || e);
    return NextResponse.json({ error: "Error del servidor." }, { status: 500 });
  }
}
