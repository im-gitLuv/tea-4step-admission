// ─────────────────────────────────────────────────────────────
// lib/funnel.js — Carga del estado del portal (Estrato 2).
//
// loadPortalState(participant) devuelve TODO lo que /portal necesita
// en una sola llamada: tenant (brand), funnel, pasos con sus módulos
// (y los gated marcados con revealed=true/false), formularios con sus
// preguntas, y el progreso derivado. La UI deja de estar hardcodeada:
// el funnel vive en Supabase (editor admin).
//
// También centraliza getParticipantFromRequest() — la sesión de la
// cookie es la única fuente de identidad (nunca datos del body).
// ─────────────────────────────────────────────────────────────

import { readSessionFromRequest } from "./session.js";
import { getSupabaseAdmin, sbSafe } from "./supabase.js";
import { getProgressFor } from "./progress.js";

/** Participante desde la cookie de sesión (o null). */
export async function getParticipantFromRequest(request) {
  const session = readSessionFromRequest(request);
  if (!session) return null;
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("participants")
      .select("*")
      .eq("id", session.participantId)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.status === "blocked") return null;
    return data;
  } catch (e) {
    console.error("[funnel:getParticipant]", e?.message || e);
    return null;
  }
}

/** Funnel del participante (o el primero publicado del tenant). */
async function resolveFunnel(sb, participant, tenantId) {
  if (participant.funnel_id) {
    const { data } = await sb.from("funnels").select("*").eq("id", participant.funnel_id).maybeSingle();
    if (data) return data;
  }
  const { data } = await sb
    .from("funnels")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  // Amarra el funnel al participante para futuras sesiones (best-effort)
  if (data) {
    await sbSafe("participant_bind_funnel", (s) =>
      s.from("participants").update({ funnel_id: data.id }).eq("id", participant.id)
    );
  }
  return data || null;
}

/**
 * Estado completo del portal para un participante.
 * Devuelve null si no hay funnel publicado (configuración pendiente).
 */
export async function loadPortalState(participant) {
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const tenantId = participant.tenant_id;

  const [{ data: tenant }, funnel] = await Promise.all([
    sb.from("tenants").select("id, name, slug, brand").eq("id", tenantId).maybeSingle(),
    resolveFunnel(sb, participant, tenantId),
  ]);
  if (!funnel) return null;

  // Pasos del funnel (ordenados)
  const { data: steps, error: eSteps } = await sb
    .from("steps")
    .select("*")
    .eq("funnel_id", funnel.id)
    .order("position", { ascending: true });
  if (eSteps) throw eSteps;

  const stepIds = (steps || []).map((s) => s.id);

  // Módulos no eliminados de esos pasos
  const { data: modules, error: eMods } = await sb
    .from("modules")
    .select("*")
    .in("step_id", stepIds.length ? stepIds : ["00000000-0000-0000-0000-000000000000"])
    .is("deleted_at", null)
    .order("position", { ascending: true });
  if (eMods) throw eMods;

  // Módulos ya revelados para ESTE participante
  const { data: revealed } = await sb
    .from("module_states")
    .select("module_id")
    .eq("participant_id", participant.id);
  const revealedSet = new Set((revealed || []).map((r) => r.module_id));

  // Formularios referenciados por módulos type='form'
  const formIds = [...new Set((modules || []).filter((m) => m.type === "form").map((m) => m.config?.form_id).filter(Boolean))];
  const formsById = {};
  if (formIds.length) {
    const { data: forms } = await sb.from("forms").select("*").in("id", formIds);
    const { data: questions } = await sb
      .from("form_questions")
      .select("*")
      .in("form_id", formIds)
      .order("position", { ascending: true });
    (forms || []).forEach((f) => {
      formsById[f.id] = {
        id: f.id,
        title: f.title,
        description: f.description,
        submitLabel: f.submit_label,
        consentLabel: f.consent_label,
        questions: (questions || [])
          .filter((q) => q.form_id === f.id)
          .map((q) => ({ id: q.id, type: q.type, label: q.label, required: q.required, config: q.config || {} })),
      };
    });
  }

  const progress = (await getProgressFor(participant)) || { completed: [], current: 1 };

  // Árbol final (camelCase para la UI)
  const stepsOut = (steps || []).map((s) => ({
    id: s.id,
    position: s.position,
    tabLabel: s.tab_label,
    shortLabel: s.short_label,
    sideTitle: s.side_title,
    sideSub: s.side_sub,
    headline: s.headline,
    modules: (modules || [])
      .filter((m) => m.step_id === s.id)
      .map((m) => ({
        id: m.id,
        type: m.type,
        position: m.position,
        gated: Boolean(m.gated_by_trigger),
        revealed: revealedSet.has(m.id),
        config: m.config || {},
        form: m.type === "form" && m.config?.form_id ? formsById[m.config.form_id] || null : null,
      })),
  }));

  return {
    tenant: {
      id: tenant?.id || tenantId,
      name: tenant?.name || "Portal",
      slug: tenant?.slug || "",
      brand: tenant?.brand || {},
    },
    funnel: { id: funnel.id, title: funnel.title, slug: funnel.slug },
    participant: {
      id: participant.id,
      email: participant.email,
      firstName: participant.first_name,
      lastName: participant.last_name,
      crmContactId: participant.crm_contact_id,
    },
    progress,
    steps: stepsOut,
  };
}
