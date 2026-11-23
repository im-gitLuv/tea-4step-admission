// ─────────────────────────────────────────────────────────────
// lib/triggers.js — Motor de triggers (Estrato 2).
//
// fireTriggers({participant, eventType, stepId, moduleId, value}) → { effects }
//
//   1. Carga los triggers activos del funnel para ese event_type
//   2. Filtra por alcance (step_id / source_module_id — null = cualquiera)
//   3. Evalúa la condición ({pct_gte: 50} para video_progress; {} = siempre)
//   4. Ejecuta la acción:
//        reveal_module      → inserta en module_states (per-participante)
//        complete_step      → marca step_progress completed (idempotente)
//        unlock_step        → no-op (modelo secuencial: completar = desbloquear)
//        send_webhook       → encola generic_webhook en outbound_queue
//        crm_tag            → encola ghl_tag (no bloqueante, con reintento)
//        crm_custom_field   → encola ghl_custom_fields (no bloqueante)
//
// `effects` viaja al cliente para que la UI reaccione al instante
// (revelar el formulario, avanzar de paso, etc.).
// ─────────────────────────────────────────────────────────────

import { getSupabaseAdmin, sbSafe } from "./supabase.js";
import { markStepCompleted } from "./progress.js";
import { enqueueOutbound } from "./crm.js";

function conditionMet(condition, value) {
  const c = condition || {};
  if (c.pct_gte != null) {
    return Number(value?.pct || 0) >= Number(c.pct_gte);
  }
  return true; // {} → siempre
}

export async function fireTriggers({ participant, eventType, stepId = null, moduleId = null, value = {} }) {
  const sb = getSupabaseAdmin();
  const effects = [];
  if (!sb || !participant?.funnel_id) return { effects };

  let rows = [];
  try {
    const { data, error } = await sb
      .from("triggers")
      .select("*, steps!inner(funnel_id, position)")
      .eq("steps.funnel_id", participant.funnel_id)
      .eq("event_type", eventType)
      .eq("active", true);
    if (error) throw error;
    rows = data || [];
  } catch (e) {
    console.error("[triggers:load]", e?.message || e);
    return { effects };
  }

  for (const t of rows) {
    // Alcance: el trigger aplica si no fija paso/módulo, o si coincide
    if (t.step_id && stepId && t.step_id !== stepId) continue;
    if (t.source_module_id && moduleId && t.source_module_id !== moduleId) continue;
    if (!conditionMet(t.condition, value)) continue;

    const cfg = t.action_config || {};
    const stepPosition = t.steps?.position || null;

    try {
      switch (t.action_type) {
        case "reveal_module": {
          const mid = cfg.module_id;
          if (!mid) break;
          await sbSafe("reveal_module", (s) =>
            s
              .from("module_states")
              .upsert(
                { participant_id: participant.id, module_id: mid },
                { onConflict: "participant_id,module_id", ignoreDuplicates: true }
              )
          );
          effects.push({ action_type: "reveal_module", module_id: mid, step_id: t.step_id });
          break;
        }

        case "complete_step": {
          const pos = Number(cfg.step_position || stepPosition);
          if (!pos) break;
          await markStepCompleted(participant, pos);
          effects.push({ action_type: "complete_step", step_position: pos });
          break;
        }

        case "unlock_step": {
          // Modelo secuencial: completar el paso anterior YA desbloquea el
          // siguiente. La acción queda registrada como efecto para la UI.
          effects.push({ action_type: "unlock_step", step_id: t.step_id });
          break;
        }

        case "send_webhook": {
          if (!cfg.url) break;
          await enqueueOutbound({
            tenantId: participant.tenant_id,
            participantId: participant.id,
            kind: "generic_webhook",
            payload: {
              url: cfg.url,
              body: {
                event: eventType,
                value,
                step_position: stepPosition,
                participant: { id: participant.id, email: participant.email },
              },
            },
          });
          effects.push({ action_type: "send_webhook" });
          break;
        }

        case "crm_tag": {
          if (!cfg.tag) break;
          await enqueueOutbound({
            tenantId: participant.tenant_id,
            participantId: participant.id,
            kind: "ghl_tag",
            payload: {
              tag: cfg.tag,
              email: participant.email,
              crm_contact_id: participant.crm_contact_id || null,
            },
          });
          effects.push({ action_type: "crm_tag", tag: cfg.tag });
          break;
        }

        case "crm_custom_field": {
          if (!cfg.field_id) break;
          const v = value?.answer != null ? value.answer : cfg.value;
          await enqueueOutbound({
            tenantId: participant.tenant_id,
            participantId: participant.id,
            kind: "ghl_custom_fields",
            payload: {
              customFields: [{ id: cfg.field_id, value: v }],
              email: participant.email,
              crm_contact_id: participant.crm_contact_id || null,
            },
          });
          effects.push({ action_type: "crm_custom_field" });
          break;
        }

        default:
          break;
      }
    } catch (e) {
      // Un trigger que falla no rompe el flujo del lead
      console.error("[triggers:action]", t.id, t.action_type, e?.message || e);
    }
  }

  return { effects };
}
