// ─────────────────────────────────────────────────────────────
// Helper de GHL API — SOLO se usa en API routes (server-side).
// Nunca importar desde componentes cliente.
// ─────────────────────────────────────────────────────────────

const GHL_BASE = "https://services.leadconnectorhq.com";

// Calendario de Sales Call (Sesión de Diagnóstico). getNextAppointment()
// y confirmAppointment() se limitan a este calendario exclusivamente —
// si Luis agenda al lead en otro calendario, el Step 4 NO debe mostrarlo.
// Si ya tienes este ID en lib/constants.js, considera importarlo de ahí
// en vez de mantenerlo duplicado aquí.
const SALES_CALL_CALENDAR_ID = "DX1pbtzm6YUeytHYMjzW";

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
    locationId,
  )}&email=${encodeURIComponent(email)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: headers(),
    cache: "no-store",
  });

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
 * Busca la próxima cita del contacto ÚNICAMENTE en el calendario de
 * Sales Call (SALES_CALL_CALENDAR_ID) — citas en otros calendarios
 * (p. ej. Qual Call) se ignoran a propósito.
 *
 * Devuelve { id, startTime } o null si no hay cita futura no cancelada
 * en ese calendario específico.
 */
export async function getNextAppointment(contactId) {
  const res = await fetch(`${GHL_BASE}/contacts/${contactId}/appointments`, {
    method: "GET",
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  const events = data?.events || [];
  const now = Date.now();
  const upcoming = events
    .filter(
      (e) =>
        e.calendarId === SALES_CALL_CALENDAR_ID &&
        e.startTime &&
        new Date(e.startTime).getTime() > now &&
        e.appointmentStatus !== "cancelled",
    )
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  const next = upcoming[0];
  if (!next) return null;
  return { id: next.id, startTime: next.startTime };
}

/**
 * Marca una cita como confirmada en GHL. Se usa exclusivamente cuando
 * el lead confirma su cita desde el Step 4 del portal — el appointmentId
 * viene de getNextAppointment(), ya scoped al calendario de Sales Call,
 * así que no hace falta volver a validar el calendario aquí.
 */
export async function confirmAppointment(appointmentId) {
  const res = await fetch(
    `${GHL_BASE}/calendars/events/appointments/${appointmentId}`,
    {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ appointmentStatus: "confirmed" }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GHL confirm appointment failed (${res.status}): ${body}`);
  }
  return res.json();
}
