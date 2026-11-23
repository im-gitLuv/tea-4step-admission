// ─────────────────────────────────────────────────────────────
// Email transaccional con Resend (decisión D3, nota 10).
// Resend se llama por REST con fetch — sin SDK nuevo.
//
// .env:
//   RESEND_API_KEY   → clave de la cuenta (ya estaba prevista en la v1)
//   RESEND_FROM      → "TEA Admisiones <admisiones@talkenglishaca.com>"
//                      (mientras el dominio no esté verificado en Resend,
//                      usar el sandbox: "onboarding@resend.dev")
// ─────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Envía un email. Devuelve { id } de Resend o lanza error. */
export async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY ausente");

  const from = process.env.RESEND_FROM || "TEA Admisiones <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Plantilla magic_link (nota 07 §4): saludo con nombre + botón grande
 * + el link en texto plano por si el cliente de correo bloquea botones.
 */
export function renderMagicLinkEmail({ firstName, magicUrl, expiresAt, tenantName = "Talk English Academy" }) {
  const name = escapeHtml(firstName || "");
  const url = escapeHtml(magicUrl);
  const exp = expiresAt
    ? escapeHtml(new Date(expiresAt).toLocaleDateString("es", { dateStyle: "long" }))
    : "";

  const btn =
    `<a href="${url}" style="display:inline-block;background:#EA0029;color:#ffffff;` +
    `font-family:'Work Sans',Arial,sans-serif;font-size:16px;font-weight:700;` +
    `padding:14px 28px;border-radius:8px;text-decoration:none;">Entrar a mi portal</a>`;

  return `
<div style="font-family:'Work Sans',Arial,sans-serif;background:#f5f7fc;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;
              border:1px solid #e6e9f2;padding:32px 28px;">
    <div style="color:#0F145B;font-size:13px;font-weight:700;letter-spacing:.08em;
                text-transform:uppercase;margin-bottom:18px;">${escapeHtml(tenantName)}</div>
    <h1 style="color:#0F145B;font-size:22px;line-height:1.3;margin:0 0 12px;">
      Hola${name ? " " + name : ""}, tu acceso está listo</h1>
    <p style="color:#3c4257;font-size:15px;line-height:1.6;margin:0 0 22px;">
      Abre el botón para entrar a tu Portal de Admisión y continuar con los
      4 pasos antes de tu llamada. No necesitas correo ni contraseña.</p>
    <div style="text-align:center;margin:0 0 22px;">${btn}</div>
    <p style="color:#3c4257;font-size:13px;line-height:1.6;margin:0 0 8px;">
      Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
    <p style="margin:0 0 6px;"><a href="${url}" style="color:#283A97;word-break:break-all;">${url}</a></p>
    ${exp ? `<p style="color:#8a93a6;font-size:12px;margin:14px 0 0;">El enlace vence el ${exp}. Si lo pierdes, el equipo de admisiones puede enviarte uno nuevo.</p>` : ""}
  </div>
</div>`;
}
