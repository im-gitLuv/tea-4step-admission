// ─────────────────────────────────────────────────────────────
// Helper de GHL API — SOLO se usa en API routes (server-side).
// Nunca importar desde componentes cliente.
// ─────────────────────────────────────────────────────────────

const GHL_BASE = "https://services.leadconnectorhq.com";

function headers() {
  return {
    Authorization: `Bearer ${process.env.GHL_API_KEY}`,
    Version: "2021-07-28",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * Busca un contacto por email usando el endpoint de duplicados.
 * Devuelve el contacto o null si no existe.
 */
export async function findContactByEmail(email) {
  const locationId = process.env.GHL_LOCATION_ID;
  const url = `${GHL_BASE}/contacts/search/duplicate?locationId=${encodeURIComponent(
    locationId
  )}&email=${encodeURIComponent(email)}`;

  const res = await fetch(url, { method: "GET", headers: headers(), cache: "no-store" });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GHL duplicate search failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data?.contact || null;
}

/**
 * Obtiene el contacto completo por ID (incluye customFields y tags).
 */
export async function getContact(contactId) {
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
    method: "GET",
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GHL get contact failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  return data?.contact || null;
}

/**
 * Añade tags a un contacto (no reemplaza los existentes).
 */
export async function addTags(contactId, tags) {
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}/tags`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ tags }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GHL add tags failed (${res.status}): ${body}`);
  }
  return res.json();
}

/**
 * Actualiza custom fields del contacto (patrón validado en tea-portal).
 * customFields: [{ id: "<fieldId>", value: "..." }, ...]
 */
export async function updateContactCustomFields(contactId, customFields) {
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ customFields }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GHL update contact failed (${res.status}): ${body}`);
  }
  return res.json();
}

/**
 * Busca la próxima cita del contacto en el calendario de Sales Call.
 * Devuelve startTime (ISO) o null.
 */
export async function getNextAppointment(contactId) {
  const res = await fetch(
    `${GHL_BASE}/contacts/${contactId}/appointments`,
    { method: "GET", headers: headers(), cache: "no-store" }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const events = data?.events || [];
  const now = Date.now();
  const upcoming = events
    .filter((e) => e.startTime && new Date(e.startTime).getTime() > now && e.appointmentStatus !== "cancelled")
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  return upcoming[0]?.startTime || null;
}
