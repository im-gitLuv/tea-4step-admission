import { NextResponse } from "next/server";
import { getNextAppointment } from "../../../lib/ghl";

/**
 * GET /api/appointment?contactId=xxx
 *
 * Consulta fresca de la próxima cita del contacto (Bloque E).
 * No se cachea el dato del login: se pide en el momento en que
 * el lead llega al Step 4, para reflejar citas agendadas después
 * del login.
 *
 * Devuelve { startTime: string | null }.
 * getNextAppointment() en lib/ghl.js solo expone startTime — no hay
 * endTime/title en la respuesta actual de GHL para este endpoint,
 * así que ConfirmStep.js calcula el fin asumiendo la duración
 * default de la Sesión de Diagnóstico.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const contactId = searchParams.get("contactId");

  if (!contactId) {
    return NextResponse.json({ error: "Falta contactId." }, { status: 400 });
  }

  try {
    const startTime = await getNextAppointment(contactId);
    return NextResponse.json({ startTime: startTime || null });
  } catch (e) {
    console.error("[api/appointment] error:", e);
    // No es crítico: si falla, ConfirmStep cae al edge case "sin cita".
    return NextResponse.json({ startTime: null });
  }
}
