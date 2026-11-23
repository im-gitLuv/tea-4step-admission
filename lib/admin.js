// ─────────────────────────────────────────────────────────────
// lib/admin.js — Sesión de administrador (Estrato 3).
//
// El login usa Supabase Auth (email + password) VERIFICADO EN EL
// SERVIDOR: el navegador nunca ve Supabase. Tras validar credenciales
// y membresía en admin_users, se emite una cookie httpOnly firmada
// (misma técnica que la sesión del participante, prefijo "a2").
//
// ADMIN_BOOTSTRAP_EMAIL (opcional): si ese email hace login y todavía
// no tiene fila en admin_users, se auto-alta como 'owner' del tenant
// TENANT_SLUG (default 'tea'). Es el arranque de un solo comando.
// ─────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getSupabaseAdmin, sbSafe } from "./supabase.js";

export const ADMIN_COOKIE = "admin_session";
export const ADMIN_TTL_SECONDS = 8 * 60 * 60; // 8 horas

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET no configurada — genera una con: openssl rand -base64 32");
  }
  return secret;
}

function sign(payload) {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function signAdminSession(userId) {
  const exp = Math.floor(Date.now() / 1000) + ADMIN_TTL_SECONDS;
  const payload = `a2.${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

/** Devuelve { userId, exp } o null. Nunca lanza. */
export function verifyAdminSession(value) {
  if (!value || typeof value !== "string") return null;
  try {
    const parts = value.split(".");
    if (parts.length !== 4) return null;
    const [version, userId, expStr, sig] = parts;
    if (version !== "a2") return null;
    const exp = Number(expStr);
    if (!Number.isInteger(exp) || exp * 1000 < Date.now()) return null;
    const expected = sign(`a2.${userId}.${expStr}`);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { userId, exp };
  } catch (_) {
    return null;
  }
}

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_TTL_SECONDS,
  };
}

/**
 * Quién es el admin de esta request (para API routes).
 * Devuelve { userId, email, tenantId, role } | null.
 */
export async function getAdminFromRequest(request) {
  const raw = request?.cookies?.get?.(ADMIN_COOKIE)?.value;
  const session = verifyAdminSession(raw);
  if (!session) return null;

  const sb = getSupabaseAdmin();
  if (!sb) return null;

  try {
    const { data: row, error } = await sb
      .from("admin_users")
      .select("user_id, tenant_id, role")
      .eq("user_id", session.userId)
      .maybeSingle();
    if (error) throw error;
    if (!row) return null;

    const { data: userData } = await sb.auth.admin.getUserById(session.userId);
    return {
      userId: row.user_id,
      tenantId: row.tenant_id,
      role: row.role || "editor",
      email: userData?.user?.email || "",
    };
  } catch (e) {
    console.error("[admin:whoami]", e?.message || e);
    return null;
  }
}

/** Respuesta 401 estándar para las rutas admin. */
export function adminUnauthorized() {
  return Response.json({ error: "No autorizado. Inicia sesión en /admin." }, { status: 401 });
}

/** Login server-side: devuelve { userId } o { error }. */
export async function signInAdminUser(email, password) {
  const sb = getSupabaseAdmin();
  if (!sb) throw new Error("Supabase no configurado");
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail || !password) return { error: "Credenciales incompletas." };

  const { data, error } = await sb.auth.signInWithPassword({
    email: cleanEmail,
    password: String(password),
  });
  if (error || !data?.user) return { error: "Correo o contraseña incorrectos." };

  // ¿Es admin?
  const { data: row } = await sb
    .from("admin_users")
    .select("user_id, tenant_id, role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (row) return { userId: row.user_id, tenantId: row.tenant_id, role: row.role };

  // Bootstrap de un solo comando (env ADMIN_BOOTSTRAP_EMAIL)
  const bootstrap = String(process.env.ADMIN_BOOTSTRAP_EMAIL || "").trim().toLowerCase();
  if (bootstrap && cleanEmail === bootstrap) {
    const slug = process.env.TENANT_SLUG || "tea";
    const { data: tenant } = await sb.from("tenants").select("id").eq("slug", slug).maybeSingle();
    if (!tenant) return { error: `Tenant "${slug}" no encontrado (¿ejecutaste la semilla 0002?).` };
    const insRes = await sbSafe("admin_bootstrap", (s) =>
      s.from("admin_users").insert({ user_id: data.user.id, tenant_id: tenant.id, role: "owner" })
    );
    const insErr = insRes?.error || null;
    // Verificar de nuevo: sbSafe puede tragarse el error
    const { data: check } = await sb
      .from("admin_users")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (!check && insErr) {
      return { error: `No se pudo crear el admin: ${insErr.message || insErr}` };
    }
    return { userId: data.user.id, tenantId: tenant.id, role: "owner" };
  }

  return { error: "Este usuario no es administrador del portal." };
}

/** Lee la cookie desde el request de una Server Component / route. */
export function readAdminCookieFromCookies() {
  try {
    const jar = cookies();
    return verifyAdminSession(jar.get(ADMIN_COOKIE)?.value);
  } catch (_) {
    return null;
  }
}
