#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// scripts/admin/revoke-link.mjs — revocar magic links.
//
//   Por token concreto:
//     node scripts/admin/revoke-link.mjs --token <TOKEN_PLANO>
//
//   Todos los tokens activos de un participante:
//     node scripts/admin/revoke-link.mjs --email lead@correo.com
//
// Revocar NO borra al participante ni su progreso: solo cierra la
// puerta. Luego se le puede emitir un token nuevo con send-link.mjs.
// ─────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

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

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const token = arg("--token");
const email = arg("--email");
if (!token && !email) {
  console.error("Uso: node scripts/admin/revoke-link.mjs (--token TOKEN | --email lead@correo.com)");
  process.exit(1);
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

try {
  let participantId = null;

  if (email) {
    const { data: participant, error } = await sb
      .from("participants")
      .select("id, email")
      .eq("email", email.trim().toLowerCase())
      .eq("tenant_id", (await sb.from("tenants").select("id").eq("slug", process.env.TENANT_SLUG || "tea").maybeSingle()).data?.id)
      .maybeSingle();
    if (error) throw error;
    if (!participant) throw new Error(`Participante no encontrado: ${email}`);
    participantId = participant.id;
  }

  const update = { revoked_at: new Date().toISOString() };
  let query = sb.from("access_tokens").update(update).is("revoked_at", null);
  query = token
    ? query.eq("token_hash", createHash("sha256").update(token).digest("hex"))
    : query.eq("participant_id", participantId);

  const { data, error } = await query.select("id");
  if (error) throw error;

  console.log(`\n✔ Tokens revocados: ${(data || []).length}`);
  process.exit(0);
} catch (e) {
  console.error("\n✘ Error:", e?.message || e);
  process.exit(1);
}
