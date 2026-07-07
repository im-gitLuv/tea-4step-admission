import { NextResponse } from "next/server";
import { getNextAppointment, confirmAppointment } from "../../../lib/ghl";

/**
 * GET /api/appointment?contactId=xxx
 *
 * Consulta fresca de la próxima cita del contacto en el calendario de
 * Sales Call específicamente (Bloque E). No se cachea el dato del login:
 * se pide en el momento en que el lead llega al Step 4.
 *
 * Devuelve { id: string, startTime: string } o { id: null, startTime: null }
 * si no hay cita futura no cancelada en ese calendario.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const contactId = searchParams.get("contactId");

  if (!contactId) {
    return NextResponse.json({ error: "Falta contactId." }, { status: 400 });
  }

  try {
    const appt = await getNextAppointment(contactId);
    return NextResponse.json({
      id: appt?.id || null,
      startTime: appt?.startTime || null,
    });
  } catch (e) {
    console.error("[api/appointment GET] error:", e);
    // No es crítico: si falla, ConfirmStep cae al edge case "sin cita".
    return NextResponse.json({ id: null, startTime: null });
  }
}

/**
 * POST /api/appointment
 * Body: { appointmentId: string }
 *
 * Confirma la cita en GHL (appointmentStatus -> "confirmed"). Esto SÍ es
 * crítico: si falla, el botón "Confirmar cita" del Step 4 debe mostrar
 * error y no avanzar — el estado real en el calendario de Luis es lo
 * que se está actualizando aquí, no solo un tag de tracking.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const { appointmentId } = body || {};
  if (!appointmentId) {
    return NextResponse.json(
      { error: "Falta appointmentId." },
      { status: 400 },
    );
  }

  try {
    await confirmAppointment(appointmentId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/appointment POST] error confirmando cita:", e);
    return NextResponse.json(
      { error: "No pudimos confirmar tu cita. Intenta de nuevo." },
      { status: 502 },
    );
  }
}
