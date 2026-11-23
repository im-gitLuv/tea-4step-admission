// ─────────────────────────────────────────────────────────────
// /a/<token> — Redención del magic link (Estrato 1, nota 07 §2.2).
//
// Route handler puro (sin JS de cliente): valida el token, abre la
// sesión (cookie httpOnly firmada 12h) y redirige al portal. Si el
// token es inválido/expirado/revocado → pantalla amable /link-invalido.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { redeemToken } from "@/lib/tokens";
import {
  PARTICIPANT_COOKIE,
  signSession,
  sessionCookieOptions,
} from "@/lib/session";
import { checkRateLimit } from "@/lib/rateLimit";

export async function GET(request, { params }) {
  // Rate limit por IP: 10 intentos/minuto (nota 07 §3)
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(`redeem:${ip}`, 10, 60_000)) {
    return NextResponse.redirect(new URL("/link-invalido?motivo=rate", request.url));
  }

  const { token } = params || {};
  const result = await redeemToken(token);

  if (!result.participant) {
    console.warn(`[/a/token] rechazado (${result.reason})`);
    return NextResponse.redirect(new URL("/link-invalido", request.url));
  }

  const response = NextResponse.redirect(new URL("/portal", request.url));
  response.cookies.set(
    PARTICIPANT_COOKIE,
    signSession(result.participant.id),
    sessionCookieOptions()
  );
  return response;
}
