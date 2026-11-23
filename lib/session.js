// ─────────────────────────────────────────────────────────────
// Sesión del participante (v2) — cookie httpOnly firmada con HMAC.
//
// Spec: nota 07 §3 — httpOnly, secure, sameSite=lax, firmada con
// clave de entorno, expiración 12 h. El participante la refresca
// volviendo a abrir su magic link (que vence a 30 días).
// No hay JWT en el navegador → nada que copiar/forjar.
// ─────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from "node:crypto";

export const PARTICIPANT_COOKIE = "participant_token";

// 12 horas (nota 07 §3)
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET no configurada — genera una con: openssl rand -base64 32"
    );
  }
  return secret;
}

function sign(payload) {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

/**
 * Devuelve el valor de la cookie firmado para un participante.
 * Formato: "v1.<participant_id>.<exp_unix>.<firma>"
 */
export function signSession(participantId) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `v1.${participantId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Verifica firma + expiración. Devuelve { participantId, exp } o null.
 * Comparación en tiempo constante (timingSafeEqual).
 * NUNCA lanza: sin SESSION_SECRET configurada devuelve null (modo v1 puro)
 * para que las rutas de la v1 sigan funcionando sin tocar nada.
 */
export function verifySession(value) {
  if (!value || typeof value !== "string") return null;
  try {
    const parts = value.split(".");
    if (parts.length !== 4) return null;
    const [version, participantId, expStr, sig] = parts;
    if (version !== "v1") return null;
    const exp = Number(expStr);
    if (!Number.isInteger(exp) || exp * 1000 < Date.now()) return null;

    const expected = sign(`v1.${participantId}.${expStr}`);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    return { participantId, exp };
  } catch (_) {
    return null;
  }
}

/** Lee y valida la cookie desde un NextRequest (API routes). */
export function readSessionFromRequest(request) {
  const raw = request?.cookies?.get?.(PARTICIPANT_COOKIE)?.value;
  return verifySession(raw);
}

/** Opciones de la cookie (nota 07 §3). secure solo en producción. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
