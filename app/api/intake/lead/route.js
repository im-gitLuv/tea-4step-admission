// ─────────────────────────────────────────────────────────────
// POST /api/intake/lead — Webhook de entrada (Estrato 4).
//
// Para que CUALQUIER CRM (incluido FunnelUp/GHL vía automatización)
// pida el magic link de un lead y lo entregue por su propio canal.
//
// Headers: x-intake-secret: <secret del tenant> (config de la
//          integración o env INTAKE_SECRET)
// Body:    { tenant_slug?, email, first_name?, last_name?, phone?,
//            funnel_slug?, send_email? }
//
// Respuesta: { ok, participant_id, magic_url, expires_at, email_sent }
// La automatización del CRM envía `magic_url` por WhatsApp/email.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getSupabaseAdmin, sbSafe } from "@/lib/supabase";
import { createAccess } from "@/lib/invite";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(`intake:${ip}`, 30, 60_000)) {
    return NextResponse.json({ ok: false, error: "Demasiadas peticiones." }, { status: 429 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "Supabase no configurado." }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body inválido." }, { status: 400 });
  }

  const { tenant_slug, funnel_slug, email, first_name, last_name, phone, send_email } = body || {};
  if (!email || !String(email).includes("@")) {
    return NextResponse.json({ ok: false, error: "Email inválido." }, { status: 400 });
  }

  try {
    // 1) Tenant (default: TENANT_SLUG o 'tea')
    const slug = tenant_slug || process.env.TENANT_SLUG || "tea";
    const { data: tenant } = await sb.from("tenants").select("id, name").eq("slug", slug).maybeSingle();
    if (!tenant) {
      return NextResponse.json({ ok: false, error: `Tenant "${slug}" no encontrado.` }, { status: 404 });
    }

    // 2) Verificación del secret (config de la integración o env)
    const { data: integ } = await sb
      .from("crm_integrations")
      .select("config")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const expected = integ?.config?.intake_secret || process.env.INTAKE_SECRET || "";
    const provided = request.headers.get("x-intake-secret") || "";
    if (!expected || provided !== expected) {
      return NextResponse.json({ ok: false, error: "x-intake-secret inválido." }, { status: 401 });
    }

    // 3) Funnel (por slug o el primero publicado)
    let funnel = null;
    if (funnel_slug) {
      const { data } = await sb
        .from("funnels")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("slug", funnel_slug)
        .maybeSingle();
      funnel = data;
    }
    if (!funnel) {
      const { data } = await sb
        .from("funnels")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("status", "published")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      funnel = data;
    }

    // 4) Crear/reutilizar participante + token
    const result = await createAccess({
      tenantId: tenant.id,
      tenantName: tenant.name,
      email,
      firstName: first_name || "",
      lastName: last_name || "",
      phone: phone || "",
      funnelId: funnel?.id || null,
      delivery: "email",
      expiresDays: 30,
      sendEmail: send_email !== false,
      source: "webhook_crm",
    });

    await sbSafe("intake_event", (s) =>
      s.from("event_log").insert({
        participant_id: result.participant.id,
        event_type: "intake_lead_created",
        value: { tenant_slug: slug, funnel_id: funnel?.id || null },
      })
    );

    return NextResponse.json({
      ok: true,
      participant_id: result.participant.id,
      magic_url: result.magicUrl,
      expires_at: result.expiresAt,
      email_sent: result.emailSent,
      email_error: result.emailError || null,
    });
  } catch (e) {
    console.error("[/api/intake/lead]", e?.message || e);
    return NextResponse.json({ ok: false, error: e?.message || "Error del servidor." }, { status: 500 });
  }
}
