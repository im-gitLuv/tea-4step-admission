import { NextResponse } from "next/server";
import { addTags } from "@/lib/ghl";
import { STEP_TAGS } from "@/lib/constants";

export async function POST(request) {
  try {
    const { contactId, step } = await request.json();

    if (!contactId || !STEP_TAGS[step]) {
      return NextResponse.json(
        { success: false, message: "Datos inválidos." },
        { status: 400 }
      );
    }

    await addTags(contactId, [STEP_TAGS[step]]);

    return NextResponse.json({ success: true, tag: STEP_TAGS[step] });
  } catch (err) {
    console.error("[/api/step-complete]", err);
    // No bloqueamos al lead si el tag falla: devolvemos 200 con warning
    // para que el portal siga funcionando (el tag es tracking, no crítico).
    return NextResponse.json({ success: false, warning: "tag_failed" });
  }
}
