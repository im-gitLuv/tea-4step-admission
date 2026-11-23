// ─────────────────────────────────────────────────────────────
// GET /api/cron/outbound — Drenaje programado de la cola CRM (Estrato 4).
//
// Se llama desde Vercel Cron (vercel.json, cada 5 min) con la cabecera
// `Authorization: Bearer <CRON_SECRET>` (o ?secret=...). También la
// invoca el botón "Procesar cola ahora" del panel admin.
//
// Procesa hasta 50 trabajos: ghl_tag, ghl_custom_fields, generic_webhook.
// Reintento con backoff (2/4/6/8 min) hasta 5 intentos → 'dead'.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { drainOutboundQueue } from "@/lib/crm";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret") || "";
  const header = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const expected = process.env.CRON_SECRET || "";

  // Sin CRON_SECRET configurada, la ruta queda deshabilitada (fail-closed)
  if (!expected) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurada." }, { status: 503 });
  }
  if (secret !== expected && header !== expected) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  const result = await drainOutboundQueue(50);
  return NextResponse.json({ ok: true, ...result });
}
