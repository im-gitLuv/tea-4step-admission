// ─────────────────────────────────────────────────────────────
// POST /api/admin/invite — Crear acceso (magic link) desde la UI (Estrato 3).
//
// Reusa createAccess() del Estrato 1: upsert de participante + token
// (solo sha256) + email opcional por Resend. Devuelve la URL completa
// para "Copiar para WhatsApp".
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { resolveMx, resolve as resolveDns } from "node:dns/promises";
import { getAdminFromRequest, adminUnauthorized } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createAccess } from "@/lib/invite";
import { validateEmail, normalizePhone } from "@/lib/validation";

/** ¿El dominio del correo puede recibir email? MX o, en su defecto, registro A. */
async function domainCanReceiveMail(domain) {
  const mx = await resolveMx(domain).catch(() => null);
  if (mx && mx.length) return true;
  const a = await resolveDns(domain).catch(() => null);
  return Array.isArray(a) && a.length > 0;
}

export async function POST(request) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return adminUnauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const { email, first_name, last_name, phone, delivery, expires_days, send_email, funnel_id } = body || {};

  // ── Validación fuerte de email (formato) ──
  const ev = validateEmail(email);
  if (!ev.ok) {
    return NextResponse.json({ error: ev.error }, { status: 400 });
  }
  const cleanEmail = ev.value;

  // ── Validación de dominio: ¿existe y puede recibir correo? ──
  const domain = cleanEmail.split("@")[1];
  const canReceive = await domainCanReceiveMail(domain);
  if (!canReceive) {
    return NextResponse.json(
      { error: `El dominio "${domain}" no existe o no puede recibir correo — revisa la dirección.` },
      { status: 400 }
    );
  }

  // ── Validación fuerte de teléfono (opcional, pero si va, formato internacional) ──
  const pv = normalizePhone(phone);
  if (!pv.ok) {
    return NextResponse.json({ error: pv.error }, { status: 400 });
  }
  const cleanPhone = pv.value;

  try {
    const sb = getSupabaseAdmin();
    const { data: tenant } = await sb.from("tenants").select("id, name").eq("id", admin.tenantId).maybeSingle();
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado." }, { status: 404 });

    const result = await createAccess({
      tenantId: tenant.id,
      tenantName: tenant.name,
      email: cleanEmail,
      firstName: first_name || "",
      lastName: last_name || "",
      phone: cleanPhone,
      funnelId: funnel_id || null,
      delivery: delivery || "email",
      expiresDays: Number(expires_days || 30),
      sendEmail: send_email !== false,
      source: "admin_invite",
    });

    const expires = new Date(result.expiresAt).toLocaleDateString("es");
    const nombre = result.participant.first_name || "";
    const whatsappBlock =
      `Hola${nombre ? " " + nombre : ""} 👋 Te comparto tu acceso al Portal de Admisión de ${tenant.name}:\n\n` +
      `${result.magicUrl}\n\n` +
      `Ábrelo desde tu celular y continúa con los pasos antes de tu llamada. (El enlace vence el ${expires}.)`;

    return NextResponse.json({
      ok: true,
      participant: result.participant,
      magic_url: result.magicUrl,
      expires_at: result.expiresAt,
      email_sent: result.emailSent,
      email_error: result.emailError,
      whatsapp_block: whatsappBlock,
    });
  } catch (e) {
    console.error("[/api/admin/invite]", e?.message || e);
    return NextResponse.json({ error: e?.message || "Error del servidor." }, { status: 500 });
  }
}
