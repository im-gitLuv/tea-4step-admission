// ─────────────────────────────────────────────────────────────
// Rate limit en memoria (best-effort) para /a/[token].
// Nota 07 §3: frenar fuerza bruta de URLs.
//
// Limitación honesta: en Vercel serverless el mapa vive por instancia
// — la protección es parcial. La defensa real es el propio token:
// 256 bits aleatorios (43 chars base64url) hacen el guessing
// matemáticamente inviable. Para un límite global usar Vercel WAF
// o Upstash Redis (estratos posteriores).
// ─────────────────────────────────────────────────────────────

const buckets = new Map();

/**
 * @param {string} key     p.ej. "redeem:1.2.3.4"
 * @param {number} limit   máx. de intentos por ventana
 * @param {number} windowMs ventana en ms
 * @returns {boolean} true = permitido
 */
export function checkRateLimit(key, limit, windowMs) {
  const now = Date.now();

  // Limpieza oportunista para no crecer sin límite
  if (buckets.size > 10000) {
    for (const [k, b] of buckets) {
      if (now > b.reset) buckets.delete(k);
    }
  }

  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}
