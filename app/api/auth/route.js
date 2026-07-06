import { NextResponse } from "next/server";
import { findContactByEmail, getNextAppointment } from "@/lib/ghl";

export async function POST(request) {
  try {
    const { email } = await request.json();

    // Normalizar: lowercase + trim (edge case documentado en el plan)
    const cleanEmail = (email || "").trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      return NextResponse.json(
        { success: false, message: "Por favor escribe un correo válido." },
        { status: 400 }
      );
    }

    const contact = await findContactByEmail(cleanEmail);

    if (!contact) {
      return NextResponse.json(
        {
          success: false,
          message:
            "No encontramos ese correo. Usa el mismo correo con el que agendaste tu llamada, o escríbenos por WhatsApp.",
        },
        { status: 404 }
      );
    }

    // Buscar la próxima cita del contacto (puede no existir → null)
    let appointmentDateTime = null;
    try {
      appointmentDateTime = await getNextAppointment(contact.id);
    } catch (_) {
      // No bloquear el login si falla la consulta de citas
    }

    return NextResponse.json({
      success: true,
      contact: {
        id: contact.id,
        firstName: contact.firstName || "",
        lastName: contact.lastName || "",
        email: contact.email || cleanEmail,
        phone: contact.phone || "",
        appointmentDateTime,
      },
    });
  } catch (err) {
    console.error("[/api/auth]", err);
    return NextResponse.json(
      { success: false, message: "Error del servidor. Intenta de nuevo en un momento." },
      { status: 500 }
    );
  }
}
