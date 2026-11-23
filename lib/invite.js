// ─────────────────────────────────────────────────────────────
// createAccess — corazón del envío de magic links (nota 07 §2.1/§5).
//
// Lo usan los scripts de admin del Estrato 1 y, en el Estrato 3,
// la vista admin /api/admin/invite. Flujo:
//   1) upsert participants (unique tenant_id + email)
//   2) token 32B → access_tokens (solo sha256)
//   3) email con Resend + email_logs
//   4) devuelve magicUrl para "Copiar para WhatsApp"
// ─────────────────────────────────────────────────────────────

import { sbRequire, sbSafe } from "./supabase.js";
import { generateRawToken, hashToken } from "./tokens.js";
// ⚠️ Import con alias: la opción pública de createAccess se llama `sendEmail`
// (booleano) y SIN el alias taparía a la función sendEmail de email.js
// dentro de la destructuración de opts → "sendEmail is not a function".
import { sendEmail as sendEmailViaResend, renderMagicLinkEmail } from "./email.js";

export const DEFAULT_TENANT_SLUG = process.env.TENANT_SLUG || "tea";

export async function getTenantBySlug(slug) {
  const res = await sbRequire("tenant", (sb) =>
    sb.from("tenants").select("*").eq("slug", slug).maybeSingle()
  );
  if (!res.data) throw new Error(`Tenant "${slug}" no encontrado en Supabase`);
  return res.data;
}

/**
 * Crea (o reutiliza) el participante y emite un token nuevo.
 * @param {object} opts
 *   tenantId, email        (requeridos)
 *   firstName, lastName, phone, source
 *   funnelId               opcional — amarra al participante a un funnel concreto
 *   delivery               'email' | 'whatsapp' | 'manual' (default email)
 *   expiresDays            default 30
 *   sendEmail              default true
 *   tenantName             para la plantilla
 */
export async function createAccess(opts) {
  const {
    tenantId,
    email,
    firstName = "",
    lastName = "",
    phone = "",
    funnelId = null,
    source = "admin_invite",
    delivery = "email",
    expiresDays = 30,
    sendEmail = true,
    tenantName = "Talk English Academy",
  } = opts;

  if (!tenantId) throw new Error("createAccess: falta tenantId");
  const cleanEmail = (email || "").trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    throw new Error("createAccess: email inválido");
  }

  // 0) ¿Participante existente? Sirve para (a) no pisar datos ya guardados
  //    al reenviar un link y (b) no arrancarlo de un funnel ya asignado.
  const { data: existing } = await sbRequire("participant_lookup", (sb) =>
    sb
      .from("participants")
      .select("id, funnel_id, first_name, last_name, phone")
      .eq("tenant_id", tenantId)
      .eq("email", cleanEmail)
      .maybeSingle()
  );

  // 0.1) Funnel del participante: explícito > ya asignado > primer funnel
  //      publicado del tenant. Así el participante NACE con funnel (la ficha,
  //      el listado y el dashboard lo muestran desde el minuto cero) y queda
  //      preparado el multi-funnel (nota 08: cada proceso, su funnel).
  let effectiveFunnelId = funnelId || existing?.funnel_id || null;
  if (!effectiveFunnelId) {
    const fr = await sbSafe("default_funnel", (sb) =>
      sb
        .from("funnels")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("status", "published")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
    );
    effectiveFunnelId = fr?.data?.id || null;
  }

  // 1) Upsert de participante (arranque limpio D7: se crea al enviarle su link)
  //    En re-convites solo sobrescribimos nombre/teléfono si vienen con valor.
  const upsertRow = {
    tenant_id: tenantId,
    email: cleanEmail,
    source,
  };
  if (!existing) {
    upsertRow.first_name = firstName || "";
    upsertRow.last_name = lastName || "";
    upsertRow.phone = phone || "";
  } else {
    if (firstName) upsertRow.first_name = firstName;
    if (lastName) upsertRow.last_name = lastName;
    if (phone) upsertRow.phone = phone;
  }
  // Funnel: explícito siempre manda; el default solo si aún no tiene uno.
  if (effectiveFunnelId && (funnelId || !existing?.funnel_id)) {
    upsertRow.funnel_id = effectiveFunnelId;
  }
  const pRes = await sbRequire("participant_upsert", (sb) =>
    sb
      .from("participants")
      .upsert(upsertRow, { onConflict: "tenant_id,email" })
      .select("*")
      .single()
  );
  const participant = pRes.data;

  // 2) Token (solo el hash va a la DB)
  const rawToken = generateRawToken();
  const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);
  await sbRequire("token_insert", (sb) =>
    sb.from("access_tokens").insert({
      participant_id: participant.id,
      token_hash: hashToken(rawToken),
      delivery,
      expires_at: expiresAt.toISOString(),
      created_by: null, // Estrato 1: scripts sin usuario admin en auth.users
    })
  );

  const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");
  if (!appUrl) throw new Error("APP_URL no configurada (ej. https://portal.tu-dominio.com)");
  const magicUrl = `${appUrl}/a/${rawToken}`;

  // 3) Email + bitácora
  let emailSent = false;
  let emailError = null;
  let providerMessageId = null;
  if (sendEmail) {
    try {
      const out = await sendEmailViaResend({
        to: cleanEmail,
        subject: `Tu acceso al Portal de Admisión — ${tenantName}`,
        html: renderMagicLinkEmail({
          firstName,
          magicUrl,
          expiresAt: expiresAt.toISOString(),
          tenantName,
        }),
      });
      providerMessageId = out?.id || null;
      emailSent = true;
    } catch (e) {
      const rawMsg = String(e?.message || e);
      // Errores comunes traducidos a una acción clara para el admin.
      if (/403/.test(rawMsg) && /(testing emails|own email address)/i.test(rawMsg)) {
        emailError =
          "Resend rechazó el envío: mientras el dominio no esté verificado en Resend, " +
          "solo puedes enviar correos al email de tu propia cuenta de Resend. " +
          "Usa Copiar para WhatsApp, o verifica tu dominio en Resend (Settings > Domains).";
      } else if (/RESEND_API_KEY ausente/i.test(rawMsg)) {
        emailError =
          "RESEND_API_KEY no está configurada en .env.local — el link funciona igual con Copiar para WhatsApp.";
      } else {
        emailError = rawMsg;
      }
      console.error("[invite:email]", emailError);
    }
    await sbSafe("email_log", (sb) =>
      sb.from("email_logs").insert({
        tenant_id: tenantId,
        participant_id: participant.id,
        to_email: cleanEmail,
        subject: "Tu acceso al Portal de Admisión",
        kind: "magic_link",
        provider: "resend",
        provider_message_id: providerMessageId,
        status: emailSent ? "sent" : "failed",
      })
    );
  }

  return { participant, magicUrl, expiresAt: expiresAt.toISOString(), emailSent, emailError };
}
