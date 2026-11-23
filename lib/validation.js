// ─────────────────────────────────────────────────────────────
// lib/validation.js — Validación compartida (UI admin + rutas API).
// CJS puro para que funcione igual en el cliente (Next), en las
// API routes y en los scripts de terminal (send-link.mjs).
//
// Email: formato estricto + anti-tontos (espacios, puntos dobles).
//   La existencia real del dominio se verifica con DNS/MX en el
//   servidor (route.js) — aquí no se puede hacer DNS.
// Teléfono: formato internacional E.164 flexible — opcional, pero
//   si se llena DEBE llevar código de país con +.
// ─────────────────────────────────────────────────────────────

"use strict";

// RFC-5322 simplificado: local@dominio con al menos un punto en el dominio
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function validateEmail(email) {
  const raw = String(email || "").trim();
  if (!raw) return { ok: false, value: "", error: "Escribe un correo." };
  if (/\s/.test(raw))
    return { ok: false, value: "", error: "El correo no puede contener espacios." };
  if (raw.length > 254)
    return { ok: false, value: "", error: "El correo es demasiado largo (máx 254 caracteres)." };
  if (raw.includes(".."))
    return { ok: false, value: "", error: "El correo tiene puntos consecutivos — revisa la dirección." };
  if (!EMAIL_RE.test(raw))
    return { ok: false, value: "", error: "Formato de correo inválido. Ejemplo correcto: nombre@dominio.com" };
  const domain = raw.split("@")[1];
  const tld = domain.split(".").pop();
  if (tld.length < 2 || /^\d+$/.test(tld))
    return { ok: false, value: "", error: "El dominio del correo no parece válido (terminación incorrecta)." };
  return { ok: true, value: raw.toLowerCase(), error: "" };
}

/**
 * Normaliza teléfono al estándar internacional (E.164 flexible).
 * Acepta: +58 412 1234567 · +58412234567 · (212) 555-0123 con +
 * Rechaza: letras, muy cortos, sin código de país.
 * Vacío = válido (el teléfono es opcional).
 */
function normalizePhone(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return { ok: true, value: "", error: "" };

  let s = raw.replace(/[\s()\-.]/g, "");      // espacios, guiones, paréntesis, puntos
  if (s.startsWith("00")) s = "+" + s.slice(2); // 0058… → +58…
  if (!/^\+?\d+$/.test(s))
    return { ok: false, value: "", error: "El teléfono solo admite dígitos, espacios y + (sin letras ni símbolos)." };

  const digits = s.replace(/\D/g, "");
  if (digits.length < 7)
    return { ok: false, value: "", error: "Teléfono demasiado corto — revisa el número." };
  if (digits.length > 15)
    return { ok: false, value: "", error: "Teléfono demasiado largo (máx 15 dígitos, estándar internacional)." };
  if (!s.startsWith("+"))
    return { ok: false, value: "", error: "Incluye el código de país con + al inicio. Ejemplo: +58 412 1234567" };

  return { ok: true, value: s, error: "" };
}

module.exports = { validateEmail, normalizePhone };
