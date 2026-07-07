import { NextResponse } from "next/server";
import {
  getNextAppointment,
  confirmAppointment,
  addTags,
} from "../../../lib/ghl";

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
 * Body: { appointmentId: string, contactId: string }
 *
 * Confirma la cita en GHL (appointmentStatus -> "confirmed") Y dispara el
 * tag salescall-confirmed en el MISMO request, en el instante exacto del
 * clic del lead. Antes el tag salescall-confirmed lo ponía alguna
 * automatización nativa de GHL en otro momento (p. ej. al agendar) — al
 * ponerlo aquí explícitamente, queda atado al clic real de confirmación,
 * no a lo que dispare esa automatización por su cuenta.
 *
 * El cambio de appointmentStatus es crítico: si falla, se corta ahí y se
 * devuelve error (el botón del Step 4 no debe avanzar). El tag es
 * importante pero no bloqueante: si falla, igual devolvemos ok, con un
 * aviso en el log — el estado real de la cita ya quedó bien.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const { appointmentId, contactId } = body || {};
  if (!appointmentId) {
    return NextResponse.json(
      { error: "Falta appointmentId." },
      { status: 400 },
    );
  }
  if (!contactId) {
    return NextResponse.json({ error: "Falta contactId." }, { status: 400 });
  }

  // 1) Crítico: cambia el estado real de la cita.
  try {
    await confirmAppointment(appointmentId);
  } catch (e) {
    console.error("[api/appointment POST] error confirmando cita:", e);
    return NextResponse.json(
      { error: "No pudimos confirmar tu cita. Intenta de nuevo." },
      { status: 502 },
    );
  }

  // 2) Importante pero no bloqueante: tag salescall-confirmed en el mismo
  //    instante. Si falla, el status de la cita ya quedó confirmado —
  //    no revertimos ni fallamos la respuesta por esto.
  try {
    await addTags(contactId, ["salescall-confirmed"]);
  } catch (e) {
    console.error(
      "[api/appointment POST] tag salescall-confirmed falló (no crítico):",
      e,
    );
  }

  return NextResponse.json({ ok: true });
}
