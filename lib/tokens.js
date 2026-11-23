// ─────────────────────────────────────────────────────────────
// Magic links propios (v2) — creación y redención de tokens.
// Spec completa: nota 07 del vault.
//
//   · 32 bytes aleatorios → base64url (~43 chars)
//   · en DB SOLO sha256(token) — el token plano nunca se persiste
//   · 30 días por defecto, reutilizable, revocable
//   · múltiples tokens por participante (uno por envío)
// ─────────────────────────────────────────────────────────────

import { createHash, randomBytes } from "node:crypto";
import { sbRequire, sbSafe } from "./supabase.js";

export function hashToken(rawToken) {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Token plano de 256 bits — se muestra UNA vez (email/WhatsApp). */
export function generateRawToken() {
  return randomBytes(32).toString("base64url");
}

/**
 * Redime un magic link: valida hash, expiración, revocación y estado
 * del participante; marca primer uso, actualiza last_seen_at y registra
 * el evento session_started.
 *
 * Devuelve { participant } o { reason } con:
 *   'not_found' | 'revoked' | 'expired' | 'blocked' | 'db'
 */
export async function redeemToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string") return { reason: "not_found" };

  let row;
  try {
    const res = await sbRequire("redeem", (sb) =>
      sb
        .from("access_tokens")
        .select("*, participant:participants(*)")
        .eq("token_hash", hashToken(rawToken))
        .maybeSingle()
    );
    row = res.data;
  } catch (e) {
    console.error("[tokens:redeem]", e?.message || e);
    return { reason: "db" };
  }

  if (!row) return { reason: "not_found" };
  if (row.revoked_at) return { reason: "revoked" };
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return { reason: "expired" };
  }
  const participant = row.participant;
  if (!participant) return { reason: "not_found" };
  if (participant.status === "blocked") return { reason: "blocked" };

  // Primer uso + última actividad (best-effort, no bloquean la entrada)
  if (!row.used_at) {
    await sbSafe("redeem_used", (sb) =>
      sb.from("access_tokens").update({ used_at: new Date().toISOString() }).eq("id", row.id)
    );
  }
  await sbSafe("redeem_seen", (sb) =>
    sb
      .from("participants")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", participant.id)
  );
  await sbSafe("event_session", (sb) =>
    sb.from("event_log").insert({
      participant_id: participant.id,
      event_type: "session_started",
      value: { delivery: row.delivery },
    })
  );

  return { participant };
}
