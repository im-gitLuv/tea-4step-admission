// ─────────────────────────────────────────────────────────────
// POST /api/admin/tokens — Revocar un access token (Estrato 3).
// body { token_id } → marca revoked_at (el link deja de funcionar
// en el instante; el progreso del participante NO se toca).
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getAdminFromRequest, adminUnauthorized } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(request) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return adminUnauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }
  const { token_id, action } = body || {};
  if (action !== "revoke" || !token_id) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return NextResponse.json({ error: "Supabase no configurado." }, { status: 503 });

  try {
    // Verificar pertenencia al tenant vía participant
    const { data: tok } = await sb
      .from("access_tokens")
      .select("id, participant_id, participants!inner(tenant_id)")
      .eq("id", token_id)
      .maybeSingle();
    if (!tok || tok.participants?.tenant_id !== admin.tenantId) {
      return NextResponse.json({ error: "Token no encontrado." }, { status: 404 });
    }
    const { error } = await sb
      .from("access_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", token_id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/admin/tokens]", e?.message || e);
    return NextResponse.json({ error: "Error del servidor." }, { status: 500 });
  }
}
