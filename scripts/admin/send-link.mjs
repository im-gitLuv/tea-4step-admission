#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// scripts/admin/send-link.mjs — crear participante + enviar magic link.
//
// Uso (desde la raíz del repo, con .env.local configurado):
//
//   node scripts/admin/send-link.mjs --email lead@correo.com --nombre Ana
//   node scripts/admin/send-link.mjs --email lead@correo.com --delivery whatsapp --no-email
//   node scripts/admin/send-link.mjs --email lead@correo.com --dias 15
//
// Qué hace:
//   1) upsert del participante (tenant por TENANT_SLUG, default 'tea')
//   2) crea el token (30 días por defecto)
//   3) envía el email por Resend (salvo --no-email)
//   4) imprime el link completo + bloque listo para copiar a WhatsApp
// ─────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// ── Carga .env.local / .env sin dependencias (no pisa variables ya exportadas)
function loadEnvFiles() {
  for (const f of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
    console.log(`[env] cargado ${f}`);
  }
}
loadEnvFiles();

// ── Args
function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name) => process.argv.includes(name);

const email = arg("--email");
if (!email) {
  console.error("Uso: node scripts/admin/send-link.mjs --email lead@correo.com [--nombre Ana] [--delivery whatsapp|email|manual] [--dias 30] [--no-email]");
  process.exit(1);
}

const __dirname = new URL(".", import.meta.url).pathname;
const { getTenantBySlug, createAccess } = await import(
  pathToFileURL(resolve(__dirname, "../../lib/invite.js")).href
);

try {
  const validation = await import(
    pathToFileURL(resolve(__dirname, "../../lib/validation.js")).href
  );
  const { validateEmail, normalizePhone } = validation.default || validation;
  const emailCheck = validateEmail(email);
  if (!emailCheck.ok) {
    console.error("\n✘ Email:", emailCheck.error);
    process.exit(1);
  }
  const phoneCheck = normalizePhone(arg("--telefono") || "");
  if (!phoneCheck.ok) {
    console.error("\n✘ Teléfono:", phoneCheck.error);
    process.exit(1);
  }

  const tenant = await getTenantBySlug(process.env.TENANT_SLUG || "tea");

  const result = await createAccess({
    tenantId: tenant.id,
    tenantName: tenant.name,
    email: emailCheck.value,
    firstName: arg("--nombre") || "",
    lastName: arg("--apellido") || "",
    phone: phoneCheck.value,
    delivery: arg("--delivery") || "email",
    expiresDays: Number(arg("--dias") || 30),
    sendEmail: !hasFlag("--no-email"),
    source: "admin_invite",
  });

  const exp = new Date(result.expiresAt).toLocaleDateString("es");
  console.log("\n──────────────────────────────────────────────────────────");
  console.log(`Participante : ${result.participant.email} (${result.participant.id})`);
  console.log(`Enlace mágico: ${result.magicUrl}`);
  console.log(`Vence        : ${exp}`);
  console.log(`Email        : ${result.emailSent ? "enviado ✔" : "NO enviado ✘"}`);
  if (result.emailError) console.log(`  └─ ${result.emailError}`);
  console.log("──────────────────────────────────────────────────────────");

  const nombre = result.participant.first_name || "";
  console.log("\n📋 Copia y pega en WhatsApp:");
  console.log("──────────────────────────────────────────────────────────");
  console.log(
    `Hola${nombre ? " " + nombre : ""} 👋 Te comparto tu acceso al Portal de Admisión de ${tenant.name}:\n\n${result.magicUrl}\n\nÁbrelo desde tu celular y continúa con los 4 pasos antes de tu llamada. (El enlace vence el ${exp}.)`
  );
  console.log("──────────────────────────────────────────────────────────");
  process.exit(result.emailSent || hasFlag("--no-email") ? 0 : 2);
} catch (e) {
  console.error("\n✘ Error:", e?.message || e);
  process.exit(1);
}
