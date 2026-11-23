// ─────────────────────────────────────────────────────────────
// Cliente Supabase con service_role — SOLO server-side (API routes
// y scripts de admin). Nunca importar desde componentes cliente.
//
// Patrón idéntico al de lib/ghl.js: la clave vive en el servidor.
//
// ESTRATO 1: si las variables no están configuradas, el módulo
// devuelve null y TODAS las escrituras Supabase se convierten en
// no-ops — la app sigue funcionando 100 % como la v1. Eso permite
// desplegar este código sin tocar producción y activar Supabase
// solo cuando las variables existan.
// ─────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

let _client = null;
let _warned = false;

/** ¿Está configurado Supabase? (se lee en cada llamada, no al importar) */
export function isSupabaseEnabled() {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Cliente con service_role. El patrón de acceso de la v2 es:
 * TODO pasa por API routes server-side — el navegador jamás ve
 * Supabase (RLS queda como defensa en profundidad, nota 06 §6).
 */
export function getSupabaseAdmin() {
  if (!isSupabaseEnabled()) {
    if (!_warned) {
      console.warn(
        "[supabase] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes — " +
          "escrituras en Supabase desactivadas (la app corre en modo v1 puro)."
      );
      _warned = true;
    }
    return null;
  }
  if (!_client) {
    _client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return _client;
}

/**
 * Envoltorio para escrituras/lecturas no críticas: si Supabase no está
 * configurado o falla, registra el error y devuelve null — NUNCA rompe
 * el flujo del lead (misma filosofía que el tag GHL de la v1).
 *
 * Uso:
 *   await sbSafe("step_complete", async (sb) => {
 *     const { error } = await sb.from("step_progress").upsert({...});
 *     if (error) throw error;
 *   });
 */
export async function sbSafe(label, fn) {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  try {
    return await fn(sb);
  } catch (e) {
    console.error(`[supabase:${label}]`, e?.message || e);
    return null;
  }
}

/**
 * Igual que sbSafe pero para lecturas donde el null SÍ importa:
 * propaga el error con etiqueta clara (para /api/me, /a/[token], scripts).
 */
export async function sbRequire(label, fn) {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error(`Supabase no configurado (falta ${label})`);
  const out = await fn(sb);
  if (out && out.error) {
    throw new Error(`[supabase:${label}] ${out.error.message}`);
  }
  return out;
}
