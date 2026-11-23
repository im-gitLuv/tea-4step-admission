// ─────────────────────────────────────────────────────────────
// POST /api/form — v1 + v2 BIG BANG (doble modo).
//
//   · v1 (body contactId, sin cookie): comportamiento original — las 10
//     respuestas son custom fields en GHL (escritura crítica).
//
//   · v2 (cookie de magic link): body { formId, moduleId, answers } con
//     respuestas por question_id. Guarda form_responses + form_answers,
//     dispara el motor de triggers (form_submitted), completa el paso
//     si el módulo lo pide (complete_on_submit ≠ false) y encola la
//     sincronización al CRM vía outbound_queue (no bloqueante).
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { updateContactCustomFields, addTags } from "../../../lib/ghl";
import { readSessionFromRequest } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logParticipantEvent, markStepCompleted } from "@/lib/progress";
import { fireTriggers } from "@/lib/triggers";
import { enqueueOutbound, drainOutboundQueue } from "@/lib/crm";

// IDs de custom fields de las 10 preguntas del Step 3 (deben coincidir con FormWizard.js).
const FIELD_IDS = [
  "FmdxtrfAXQhR2W8JDyXZ", // motivacion
  "KMGZIzSLO1r5SwAY2Ntl", // situación_actual
  "VLcSkWWFLpRKvb2mjAID", // seguridad
  "ZvTvkbQVliLxsMeIWtcI", // dedicacion/tiempo
  "uyqRosmNaQqVptWhn0PB", // seriedad
  "UPcalcyHGEbk37BuDoyS", // compromiso/enfoque
  "LP0Pa6WIuzV2uZrdT3Rc", // disciplina
  "CNMfPPAfXy2Sn9dZITUp", // voz
  "iPcAqybHC06E46jhyp98", // compromiso/desicion
  "BwZoWH4kcEuxWM8u676Y", // tipo_de_pago
];

/** v2: guarda la respuesta (respuestas ya vienen por question_id). */
async function storeResponseV2({ sb, participant, formId, moduleId, answers }) {
  // 1) El formulario pertenece al tenant del participante
  const { data: form, error: eForm } = await sb
    .from("forms")
    .select("id, tenant_id")
    .eq("id", formId)
    .eq("tenant_id", participant.tenant_id)
    .maybeSingle();
  if (eForm) throw eForm;
  if (!form) throw new Error("Formulario no encontrado para este tenant");

  // 2) Módulo (para saber el paso y si completa al enviar)
  let stepId = null;
  let stepPosition = null;
  let completeOnSubmit = true;
  if (moduleId) {
    const { data: mod } = await sb
      .from("modules")
      .select("id, step_id, config, steps!inner(funnel_id, position)")
      .eq("id", moduleId)
      .maybeSingle();
    if (mod && mod.steps?.funnel_id === participant.funnel_id) {
      stepId = mod.step_id;
      stepPosition = mod.steps?.position || null;
      completeOnSubmit = mod.config?.complete_on_submit !== false;
    }
  }

  // 3) Preguntas válidas del formulario (defensa: solo ids reales)
  const { data: questions } = await sb
    .from("form_questions")
    .select("id, label, crm_field_key")
    .eq("form_id", form.id);
  const validQ = new Set((questions || []).map((q) => q.id));

  // 4) Insertar respuesta + respuestas por pregunta
  const { data: response, error: eResp } = await sb
    .from("form_responses")
    .insert({
      participant_id: participant.id,
      form_id: form.id,
      step_id: stepId,
    })
    .select("id")
    .single();
  if (eResp) throw eResp;

  const rows = Object.entries(answers || {})
    .filter(([qid, v]) => validQ.has(qid) && v !== null && v !== undefined && v !== "")
    .map(([qid, v]) => ({
      response_id: response.id,
      question_id: qid,
      value: typeof v === "boolean" || typeof v === "number" ? v : String(v),
    }));

  if (rows.length > 0) {
    const { error: eAns } = await sb.from("form_answers").insert(rows);
    if (eAns) throw eAns;
  }

  return { formId: form.id, stepId, stepPosition, completeOnSubmit, storedAnswers: rows.length, questions: questions || [] };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const { contactId, formId, moduleId, answers, agreed } = body || {};

  const session = readSessionFromRequest(request);
  const sb = getSupabaseAdmin();

  // ════════ v2: sesión de magic link → Supabase + triggers + cola CRM ════════
  if (session && sb && formId) {
    try {
      const { data: participant, error } = await sb
        .from("participants")
        .select("*")
        .eq("id", session.participantId)
        .maybeSingle();
      if (error) throw error;

      if (participant && participant.status !== "blocked") {
        const result = await storeResponseV2({ sb, participant, formId, moduleId, answers });

        await logParticipantEvent(participant, "form_submitted", {
          stepPosition: result.stepPosition,
          value: { form_id: result.formId, stored_answers: result.storedAnswers, agreed: true },
        });

        // Motor de triggers (form_submitted)
        const { effects } = await fireTriggers({
          participant,
          eventType: "form_submitted",
          stepId: result.stepId,
          moduleId: moduleId || null,
          value: { agreed: true },
        });

        // Completar el paso si el módulo lo pide (default: sí)
        if (result.completeOnSubmit && result.stepPosition) {
          await markStepCompleted(participant, result.stepPosition);
          if (!effects.some((e) => e.action_type === "complete_step" && e.step_position === result.stepPosition)) {
            effects.push({ action_type: "complete_step", step_position: result.stepPosition });
          }
        }

        // CRM no bloqueante: respuestas → custom fields + tag del paso
        const mappings = await sb
          .from("crm_integrations")
          .select("field_mappings, tag_mapping")
          .eq("tenant_id", participant.tenant_id)
          .eq("provider", "ghl")
          .eq("active", true)
          .maybeSingle();

        if (mappings.data) {
          const fieldByQuestion = {};
          (Array.isArray(mappings.data.field_mappings) ? mappings.data.field_mappings : []).forEach((m) => {
            if (m?.question_id && m?.crm_field_id) fieldByQuestion[m.question_id] = m.crm_field_id;
          });
          const customFields = Object.entries(answers || {})
            .filter(([qid]) => fieldByQuestion[qid])
            .map(([qid, v]) => ({ id: fieldByQuestion[qid], value: String(v) }));

          if (customFields.length > 0) {
            await enqueueOutbound({
              tenantId: participant.tenant_id,
              participantId: participant.id,
              kind: "ghl_custom_fields",
              payload: {
                customFields,
                email: participant.email,
                crm_contact_id: participant.crm_contact_id || null,
              },
            });
          }
          const tagMap = mappings.data.tag_mapping || {};
          const tag = tagMap.form_submitted || (result.stepPosition ? `${tagMap.step_completed_prefix || "paso_"}${result.stepPosition}_completado` : null);
          if (tag) {
            await enqueueOutbound({
              tenantId: participant.tenant_id,
              participantId: participant.id,
              kind: "ghl_tag",
              payload: { tag, email: participant.email, crm_contact_id: participant.crm_contact_id || null },
            });
          }
          drainOutboundQueue(10).catch(() => {});
        }

        return NextResponse.json({ ok: true, stored: "supabase", effects });
      }
    } catch (e) {
      console.error("[api/form][v2]", e?.message || e);
      if (!contactId) {
        return NextResponse.json(
          { error: "No pudimos guardar tus respuestas. Intenta de nuevo." },
          { status: 502 }
        );
      }
      // con contactId caemos al flujo v1 (compatibilidad)
    }
  }

  // ════════ v1: contactId requerido, GHL crítico (comportamiento original) ════════
  if (!contactId) {
    return NextResponse.json({ error: "Falta contactId." }, { status: 400 });
  }
  if (!agreed) {
    return NextResponse.json({ error: "Falta la confirmación del acuerdo." }, { status: 400 });
  }
  if (!answers || typeof answers !== "object") {
    return NextResponse.json({ error: "Faltan las respuestas." }, { status: 400 });
  }

  const customFields = FIELD_IDS.filter(
    (id) => answers[id] != null && answers[id] !== ""
  ).map((id) => ({ id, value: answers[id] }));

  if (customFields.length === 0) {
    return NextResponse.json({ error: "No hay respuestas para guardar." }, { status: 400 });
  }

  try {
    await updateContactCustomFields(contactId, customFields);
  } catch (e) {
    console.error("[api/form] error escribiendo custom fields:", e);
    return NextResponse.json(
      { error: "No pudimos guardar tus respuestas. Intenta de nuevo." },
      { status: 502 }
    );
  }

  try {
    await addTags(contactId, ["paso_3_completado"]);
  } catch (e) {
    console.error("[api/form] tag paso_3_completado falló (no crítico):", e);
  }

  return NextResponse.json({ ok: true });
}
