// ─────────────────────────────────────────────────────────────
// lib/crm.js — Conectores CRM (Estrato 4). Todo NO bloqueante:
//
//   enqueueOutbound(...)  → mete el trabajo en outbound_queue
//   drainOutboundQueue()  → procesa lo pendiente (GHL o webhook genérico)
//
// El flujo v2 NUNCA escribe al CRM dentro del request del lead:
// encola y devuelve. El drenaje corre (a) fire-and-forget justo
// tras encolar y (b) por cron cada 5 min (/api/cron/outbound) con
// reintento y backoff hasta 5 intentos → 'dead'.
// ─────────────────────────────────────────────────────────────

import { getSupabaseAdmin, sbSafe, sbRequire } from "./supabase.js";
import { findContactByEmail, addTags, updateContactCustomFields } from "./ghl.js";

const MAX_ATTEMPTS = 5;

/** Encola un trabajo de salida. Nunca lanza: devuelve {queued} o {queued:false}. */
export async function enqueueOutbound({ tenantId, participantId = null, kind, payload }) {
  if (!tenantId || !kind || !payload) return { queued: false };
  await sbSafe("outbound_enqueue", (sb) =>
    sb.from("outbound_queue").insert({
      tenant_id: tenantId,
      participant_id: participantId,
      kind,
      payload,
    })
  );
  return { queued: true };
}

/** Integración GHL activa del tenant (o null). */
async function getActiveGhl(sb, tenantId) {
  const { data, error } = await sb
    .from("crm_integrations")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("provider", "ghl")
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/** contact_id: del payload o buscando por email en GHL. */
async function resolveContactId(payload) {
  if (payload.crm_contact_id) return payload.crm_contact_id;
  if (payload.email) {
    const contact = await findContactByEmail(payload.email);
    return contact?.id || null;
  }
  return null;
}

/** Procesa una fila de la cola. Devuelve 'sent' | 'dead' | 'retry'. */
async function processOne(sb, row) {
  const mark = async (fields) => {
    const { error } = await sb.from("outbound_queue").update(fields).eq("id", row.id);
    if (error) throw error;
  };

  try {
    const payload = row.payload || {};

    if (row.kind === "generic_webhook") {
      if (!payload.url) throw new Error("generic_webhook sin url");
      const res = await fetch(payload.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload.body || {}),
      });
      if (!res.ok) throw new Error(`webhook ${res.status}: ${(await res.text()).slice(0, 200)}`);
      await mark({ status: "sent", sent_at: new Date().toISOString(), last_error: null });
      return "sent";
    }

    // kinds de GHL requieren integración activa
    const integ = await getActiveGhl(sb, row.tenant_id);
    if (!integ) throw new Error("sin integración GHL activa para el tenant");

    if (row.kind === "ghl_tag") {
      const contactId = await resolveContactId(payload);
      if (!contactId) throw new Error("contacto GHL no encontrado (sin crm_contact_id ni match por email)");
      await addTags(contactId, [payload.tag]);
      await mark({ status: "sent", sent_at: new Date().toISOString(), last_error: null });
      return "sent";
    }

    if (row.kind === "ghl_custom_fields") {
      const contactId = await resolveContactId(payload);
      if (!contactId) throw new Error("contacto GHL no encontrado (sin crm_contact_id ni match por email)");
      const customFields = (payload.customFields || [])
        .filter((f) => f && f.id)
        .map((f) => ({ id: f.id, value: String(f.value ?? "") }));
      if (customFields.length === 0) throw new Error("ghl_custom_fields vacío");
      await updateContactCustomFields(contactId, customFields);
      await mark({ status: "sent", sent_at: new Date().toISOString(), last_error: null });
      return "sent";
    }

    // kind desconocido → muere directo (no reintentar para siempre)
    await mark({ status: "dead", last_error: `kind desconocido: ${row.kind}` });
    return "dead";
  } catch (e) {
    const attempts = (row.attempts || 0) + 1;
    const msg = String(e?.message || e).slice(0, 500);
    if (attempts >= MAX_ATTEMPTS) {
      await mark({ status: "dead", attempts, last_error: msg }).catch(() => {});
      return "dead";
    }
    const backoffMs = attempts * 2 * 60 * 1000; // 2, 4, 6, 8 min
    await mark({
      attempts,
      next_retry_at: new Date(Date.now() + backoffMs).toISOString(),
      last_error: msg,
    }).catch(() => {});
    return "retry";
  }
}

/**
 * Drena la cola: procesa hasta `limit` filas pending cuyo next_retry_at venció.
 * Devuelve { processed, sent, retried, dead }.
 */
export async function drainOutboundQueue(limit = 25) {
  const sb = getSupabaseAdmin();
  if (!sb) return { processed: 0, sent: 0, retried: 0, dead: 0, disabled: true };

  const res = await sbRequire("outbound_select", (s) =>
    s
      .from("outbound_queue")
      .select("*")
      .eq("status", "pending")
      .lte("next_retry_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(limit)
  );

  const rows = res.data || [];
  const out = { processed: rows.length, sent: 0, retried: 0, dead: 0 };
  for (const row of rows) {
    try {
      const r = await processOne(sb, row);
      if (r === "sent") out.sent += 1;
      else if (r === "dead") out.dead += 1;
      else out.retried += 1;
    } catch (e) {
      console.error("[crm:drain]", row.id, e?.message || e);
    }
  }
  return out;
}
