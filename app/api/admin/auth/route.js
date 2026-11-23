// ─────────────────────────────────────────────────────────────
// /api/admin/auth — Login de administradores (Estrato 3).
//
// POST {email, password} → valida contra Supabase Auth en el servidor,
// verifica admin_users (o auto-alta con ADMIN_BOOTSTRAP_EMAIL) y deja
// la cookie httpOnly firmada 8h. El navegador nunca ve Supabase.
// DELETE → cierra sesión. GET → whoami para la UI.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  adminUnauthorized,
  getAdminFromRequest,
  signInAdminUser,
  signAdminSession,
} from "@/lib/admin";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  try {
    const result = await signInAdminUser(body?.email, body?.password);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true, userId: result.userId });
    res.cookies.set(ADMIN_COOKIE, signAdminSession(result.userId), adminCookieOptions());
    return res;
  } catch (e) {
    console.error("[/api/admin/auth]", e?.message || e);
    return NextResponse.json(
      { error: e?.message || "Error del servidor." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { ...adminCookieOptions(), maxAge: 0 });
  return res;
}

export async function GET(request) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return adminUnauthorized();
  return NextResponse.json({ ok: true, admin });
}
