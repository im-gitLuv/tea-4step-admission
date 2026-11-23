// ─────────────────────────────────────────────────────────────
// Progreso y eventos del participante en Supabase (Estrato 1).
//
// Mapea la lógica numérica de la v1 (pasos 1..4 de lib/constants.js)
// con las filas de la tabla `steps` del funnel del participante.
// Todas las funciones son tolerantes a fallos (sbSafe): un problema
// de Supabase nunca rompe el flujo del lead.
// ─────────────────────────────────────────────────────────────

import { sbSafe } from "./supabase.js";

/**
 * Mapa de pasos del funnel: { position → uuid, uuid → position }.
 * position es el número 1..N que usa toda la UI de la v1.
 */
export async function getStepMap(funnelId) {
  return sbSafe("step_map", async (sb) => {
    const { data, error } = await sb
      .from("steps")
      .select("id, position")
      .eq("funnel_id", funnelId)
      .order("position", { ascending: true });
    if (error) throw error;
    const byPosition = {};
    const byId = {};
    (data || []).forEach((s) => {
      byPosition[s.position] = s.id;
      byId[s.id] = s.position;
    });
    return { byPosition, byId, total: (data || []).length };
  });
}

/**
 * Progreso derivado del servidor, en el formato que la UI v1 espera:
 *   { completed: [1,2], current: 3 }
 * current = primer paso sin completar (o el último si todo está hecho).
 */
export async function getProgressFor(participant) {
  return sbSafe("progress_read", async (sb) => {
    const map = await getStepMapInner(sb, participant.funnel_id);
    if (!map) return { completed: [], current: 1 };

    const { data, error } = await sb
      .from("step_progress")
      .select("step_id, status")
      .eq("participant_id", participant.id);
    if (error) throw error;

    const completedPositions = (data || [])
      .filter((r) => r.status === "completed" && map.byId[r.step_id])
      .map((r) => map.byId[r.step_id])
      .sort((a, b) => a - b);

    let current = 1;
    for (let p = 1; p <= map.total; p++) {
      if (!completedPositions.includes(p)) {
        current = p;
        break;
      }
      current = Math.min(map.total, p);
    }
    return { completed: completedPositions, current };
  });
}

async function getStepMapInner(sb, funnelId) {
  if (!funnelId) return null;
  const { data, error } = await sb
    .from("steps")
    .select("id, position")
    .eq("funnel_id", funnelId)
    .order("position", { ascending: true });
  if (error) throw error;
  const byPosition = {};
  const byId = {};
  (data || []).forEach((s) => {
    byPosition[s.position] = s.id;
    byId[s.id] = s.position;
  });
  return { byPosition, byId, total: (data || []).length };
}

/**
 * Marca un paso como completado (upsert idempotente: conserva el
 * primer completed_at) + registra el evento step_completed.
 * Espeja exactamente lo que hoy se manda a GHL como tag paso_N_completado.
 */
export async function markStepCompleted(participant, stepPosition) {
  await sbSafe("step_complete", async (sb) => {
    const map = await getStepMapInner(sb, participant.funnel_id);
    const stepId = map && map.byPosition[stepPosition];
    if (!stepId) throw new Error(`step ${stepPosition} no encontrado en el funnel`);

    const { error } = await sb.from("step_progress").upsert(
      {
        participant_id: participant.id,
        step_id: stepId,
        status: "completed",
        completed_at: new Date().toISOString(),
      },
      { onConflict: "participant_id,step_id", ignoreDuplicates: true }
    );
    if (error) throw error;

    const { error: e2 } = await sb.from("event_log").insert({
      participant_id: participant.id,
      step_id: stepId,
      event_type: "step_completed",
      value: { position: stepPosition },
    });
    // El paso repetido no debe duplicar evento: idempotente también aquí.
    if (e2) console.warn("[supabase:step_event]", e2.message);
  });
}

/**
 * Inserta un evento en event_log. `value` es jsonb libre
 * ({"pct": 45}, {"agreed": true}, …).
 */
export async function logParticipantEvent(participant, type, extra = {}) {
  await sbSafe("event_log", async (sb) => {
    let stepId = null;
    if (extra.stepPosition && participant.funnel_id) {
      const map = await getStepMapInner(sb, participant.funnel_id);
      stepId = (map && map.byPosition[extra.stepPosition]) || null;
    }
    const { error } = await sb.from("event_log").insert({
      participant_id: participant.id,
      step_id: stepId,
      event_type: type,
      value: extra.value || {},
    });
    if (error) throw error;
  });
}

/** Contact shape que la UI v1 espera (Header, FormWizard, ConfirmStep). */
export function toContactShape(participant) {
  return {
    // Si el participante tiene contacto GHL enlazado, el id que viaja al
    // cliente es el de GHL → tags y custom fields siguen cayendo donde
    // siempre. Si no, el id es el uuid del participante en Supabase.
    id: participant.crm_contact_id || participant.id,
    firstName: participant.first_name || "",
    lastName: participant.last_name || "",
    email: participant.email,
    phone: participant.phone || "",
    appointmentDateTime: null,
    participantId: participant.id,
    _source: "supabase",
  };
}
