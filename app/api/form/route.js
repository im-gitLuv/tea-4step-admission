import { NextResponse } from 'next/server';
// Reutiliza los helpers ya validados en el Bloque B.
// Ajusta la ruta si tu proyecto usa alias '@/lib/ghl'.
import { updateContactCustomFields, addTags } from '../../../lib/ghl';

/**
 * POST /api/form  (Step 3 / Bloque D)
 *
 * Body: { contactId: string, answers: { [fieldId]: value }, agreed: boolean }
 *
 * 1) Escribe las 10 respuestas como custom fields en el contacto (por ID).
 * 2) Dispara el tag paso_3_completado (fire-and-forget: si el tag falla NO
 *    bloqueamos al lead, igual que en /api/step-complete).
 */

// IDs de custom fields de las 10 preguntas del Step 3 (deben coincidir con FormWizard.js).
const FIELD_IDS = [
  'FmdxtrfAXQhR2W8JDyXZ', // motivacion
  'KMGZIzSLO1r5SwAY2Ntl', // situación_actual
  'VLcSkWWFLpRKvb2mjAID', // seguridad
  'ZvTvkbQVliLxsMeIWtcI', // dedicacion/tiempo
  'uyqRosmNaQqVptWhn0PB', // seriedad
  'UPcalcyHGEbk37BuDoyS', // compromiso/enfoque
  'LP0Pa6WIuzV2uZrdT3Rc', // disciplina
  'CNMfPPAfXy2Sn9dZITUp', // voz
  'iPcAqybHC06E46jhyp98', // compromiso/desicion
  'BwZoWH4kcEuxWM8u676Y', // tipo_de_pago
];

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 });
  }

  const { contactId, answers, agreed } = body || {};

  if (!contactId) {
    return NextResponse.json({ error: 'Falta contactId.' }, { status: 400 });
  }
  if (!agreed) {
    return NextResponse.json({ error: 'Falta la confirmación del acuerdo.' }, { status: 400 });
  }
  if (!answers || typeof answers !== 'object') {
    return NextResponse.json({ error: 'Faltan las respuestas.' }, { status: 400 });
  }

  // Construye el array de custom fields solo con las respuestas presentes.
  const customFields = FIELD_IDS
    .filter((id) => answers[id] != null && answers[id] !== '')
    .map((id) => ({ id, value: answers[id] }));

  if (customFields.length === 0) {
    return NextResponse.json({ error: 'No hay respuestas para guardar.' }, { status: 400 });
  }

  // 1) Escritura de custom fields (crítica: si falla, devolvemos error al usuario).
  try {
    await updateContactCustomFields(contactId, customFields);
  } catch (e) {
    console.error('[api/form] error escribiendo custom fields:', e);
    return NextResponse.json(
      { error: 'No pudimos guardar tus respuestas. Intenta de nuevo.' },
      { status: 502 }
    );
  }

  // 2) Tag de tracking (fire-and-forget: no bloquea al lead si falla).
  try {
    await addTags(contactId, ['paso_3_completado']);
  } catch (e) {
    console.error('[api/form] tag paso_3_completado falló (no crítico):', e);
  }

  return NextResponse.json({ ok: true });
}
