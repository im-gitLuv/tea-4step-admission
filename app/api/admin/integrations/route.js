// ─────────────────────────────────────────────────────────────
// /api/admin/integrations — CRM y webhook de entrada (Estrato 4).
//
// GET   → integración GHL del tenant + cola outbound (conteos y
//         últimas 20 filas) + URL/secret del webhook de entrada.
// POST  → { action }
//           'update_ghl'      {active, tag_mapping}
//           'set_intake_secret' {secret}
//           'run_queue'       → drena la cola ahora mismo
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getAdminFromRequest, adminUnauthorized } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { drainOutboundQueue } from "@/lib/crm";

export const dynamic = "force-dynamic";

async function getGhlIntegration(sb, tenantId) {
  const { data } = await sb
    .from("crm_integrations")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("provider", "ghl")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data || null;
}

export async function GET(request) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return adminUnauthorized();

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Supabase no configurado." }, { status: 503 });

  try {
    const integ = await getGhlIntegration(sb, admin.tenantId);

    const { count: pending } = await sb
      .from("outbound_queue")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", admin.tenantId)
      .eq("status", "pending");
    const { count: failed } = await sb
      .from("outbound_queue")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", admin.tenantId)
      .in("status", ["failed", "dead"]);
    const { data: lastItems } = await sb
      .from("outbound_queue")
      .select("id, kind, status, attempts, last_error, created_at, sent_at")
      .eq("tenant_id", admin.tenantId)
      .order("created_at", { ascending: false })
      .limit(20);

    return NextResponse.json({
      ok: true,
      ghl: integ
        ? {
            id: integ.id,
            active: integ.active,
            provider: integ.provider,
            config: integ.config,
            tag_mapping: integ.tag_mapping,
            field_mappings: integ.field_mappings,
          }
        : null,
      queue: { pending: pending || 0, failed: failed || 0, items: lastItems || [] },
      intake: {
        url_path: "/api/intake/lead",
        secret_configured: Boolean(integ?.config?.intake_secret || process.env.INTAKE_SECRET),
      },
      env: {
        ghl_api_key_present: Boolean(process.env.GHL_API_KEY),
        cron_secret_present: Boolean(process.env.CRON_SECRET),
        resend_present: Boolean(process.env.RESEND_API_KEY),
      },
    });
  } catch (e) {
    console.error("[/api/admin/integrations GET]", e?.message || e);
    return NextResponse.json({ error: "Error del servidor." }, { status: 500 });
  }
}

export async function POST(request) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return adminUnauthorized();

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Supabase no configurado." }, { status: 503 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  try {
    const integ = await getGhlIntegration(sb, admin.tenantId);

    if (body.action === "update_ghl") {
      if (!integ) return NextResponse.json({ error: "No hay integración GHL para este tenant." }, { status: 404 });
      const patch = {};
      if (body.active !== undefined) patch.active = Boolean(body.active);
      if (body.tag_mapping !== undefined && typeof body.tag_mapping === "object") {
        patch.tag_mapping = body.tag_mapping;
      }
      const { error } = await sb.from("crm_integrations").update(patch).eq("id", integ.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "set_intake_secret") {
      const secret = String(body.secret || "").trim();
      if (secret.length < 12) {
        return NextResponse.json({ error: "El secret debe tener al menos 12 caracteres." }, { status: 400 });
      }
      if (integ) {
        const config = { ...(integ.config || {}), intake_secret: secret };
        const { error } = await sb.from("crm_integrations").update({ config }).eq("id", integ.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("crm_integrations").insert({
          tenant_id: admin.tenantId,
          provider: "ghl",
          config: { intake_secret: secret },
          active: false,
        });
        if (error) throw error;
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "run_queue") {
      const out = await drainOutboundQueue(50);
      return NextResponse.json({ ok: true, result: out });
    }

    return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  } catch (e) {
    console.error("[/api/admin/integrations POST]", e?.message || e);
    return NextResponse.json({ error: e?.message || "Error del servidor." }, { status: 500 });
  }
}
