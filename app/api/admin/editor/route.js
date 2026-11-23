// ─────────────────────────────────────────────────────────────
// POST /api/admin/editor — Operaciones del editor modular (Estrato 3).
//
// Un solo endpoint con `op` para mantener la superficie pequeña.
// TODA operación verifica que la fila pertenezca al tenant del admin.
//
//   funnel.create {title, slug} · funnel.update {id, title, status}
//   step.create {funnel_id} · step.update {id, fields} · step.delete {id}
//   step.move {id, direction: 'up'|'down'}
//   module.create {step_id, type} · module.update {id, config, gated_by_trigger, position}
//   module.delete {id}   (soft delete: deleted_at)
//   trigger.create {step_id, event_type, source_module_id, condition, action_type, action_config, active}
//   trigger.update {id, ...} · trigger.delete {id}
//   form.create {title} · form.update {id, title, description, submit_label, consent_label}
//   question.create {form_id, label, type, required, config, crm_field_key}
//   question.update {id, ...} · question.delete {id}
// ─────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getAdminFromRequest, adminUnauthorized } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";

const MODULE_TYPE_DEFAULTS = {
  text: { title: "Nuevo texto", body: "Escribe aquí el contenido. Separa párrafos con una línea en blanco." },
  video: { asset_url: "", poster_url: "", seek_lock: true, require_full_watch: true, title: "" },
  image: { url: "", alt: "", caption: "" },
  form: { form_id: "", complete_on_submit: true },
  button: { label: "Continuar", action: "next", url: "", target: "_self" },
  download: { label: "Descargar documento", url: "", filename: "" },
  scheduler: {
    provider: "ghl",
    reschedule_widget_url: "",
    complete_on_confirm: true,
  },
  html: { html: "<p>HTML libre</p>" },
};

function bad(msg, code = 400) {
  return NextResponse.json({ error: msg }, { status: code });
}

async function ownedFunnel(sb, tenantId, funnelId) {
  const { data } = await sb.from("funnels").select("id").eq("id", funnelId).eq("tenant_id", tenantId).maybeSingle();
  return Boolean(data);
}
async function ownedStep(sb, tenantId, stepId) {
  const { data } = await sb
    .from("steps")
    .select("id, funnel_id, funnels!inner(tenant_id)")
    .eq("id", stepId)
    .maybeSingle();
  return data && data.funnels?.tenant_id === tenantId ? data : null;
}
async function ownedModule(sb, tenantId, moduleId) {
  const { data } = await sb
    .from("modules")
    .select("id, step_id, steps!inner(funnel_id, funnels!inner(tenant_id))")
    .eq("id", moduleId)
    .maybeSingle();
  return data && data.steps?.funnels?.tenant_id === tenantId ? data : null;
}
async function ownedTrigger(sb, tenantId, triggerId) {
  const { data } = await sb
    .from("triggers")
    .select("id, step_id, steps!inner(funnel_id, funnels!inner(tenant_id))")
    .eq("id", triggerId)
    .maybeSingle();
  return data && data.steps?.funnels?.tenant_id === tenantId ? data : null;
}
function ownedForm(sb, tenantId, formId) {
  return sb.from("forms").select("id").eq("id", formId).eq("tenant_id", tenantId).maybeSingle();
}
async function assertOwnedForm(sb, tenantId, formId) {
  const { data } = await ownedForm(sb, tenantId, formId);
  return Boolean(data);
}

export async function POST(request) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return adminUnauthorized();

  const sb = getSupabaseAdmin();
  if (!sb) return bad("Supabase no configurado.", 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Body inválido.");
  }
  const { op } = body || {};
  const tenantId = admin.tenantId;

  try {
    switch (op) {
      // ── Funnel ──
      case "funnel.create": {
        const title = (body.title || "Nuevo funnel").slice(0, 120);
        const slugBase = (body.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).slice(0, 60);
        const slug = `${slugBase || "funnel"}-${Math.random().toString(36).slice(2, 6)}`;
        const { data, error } = await sb
          .from("funnels")
          .insert({ tenant_id: tenantId, title, slug, status: "draft" })
          .select("id")
          .single();
        if (error) throw error;
        return NextResponse.json({ ok: true, id: data.id });
      }
      case "funnel.update": {
        if (!(await ownedFunnel(sb, tenantId, body.id))) return bad("Funnel no encontrado.", 404);
        const patch = {};
        if (body.title != null) patch.title = String(body.title).slice(0, 120);
        if (body.status != null && ["draft", "published", "archived"].includes(body.status)) patch.status = body.status;
        const { error } = await sb.from("funnels").update(patch).eq("id", body.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      // ── Steps ──
      case "step.create": {
        if (!(await ownedFunnel(sb, tenantId, body.funnel_id))) return bad("Funnel no encontrado.", 404);
        const { data: maxRow } = await sb
          .from("steps")
          .select("position")
          .eq("funnel_id", body.funnel_id)
          .order("position", { ascending: false })
          .limit(1)
          .maybeSingle();
        const pos = (maxRow?.position || 0) + 1;
        const { data, error } = await sb
          .from("steps")
          .insert({
            funnel_id: body.funnel_id,
            position: pos,
            tab_label: `Paso ${pos}`,
            short_label: `P${pos}`,
            side_title: `Paso ${pos}`,
            side_sub: "",
            headline: `Paso ${pos}`,
          })
          .select("id")
          .single();
        if (error) throw error;
        return NextResponse.json({ ok: true, id: data.id });
      }
      case "step.update": {
        const st = await ownedStep(sb, tenantId, body.id);
        if (!st) return bad("Paso no encontrado.", 404);
        const patch = {};
        for (const k of ["tab_label", "short_label", "side_title", "side_sub", "headline"]) {
          if (body[k] != null) patch[k] = String(body[k]).slice(0, 300);
        }
        const { error } = await sb.from("steps").update(patch).eq("id", body.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "step.delete": {
        const st = await ownedStep(sb, tenantId, body.id);
        if (!st) return bad("Paso no encontrado.", 404);
        const { error } = await sb.from("steps").delete().eq("id", body.id);
        if (error) throw error;
        // Renumerar
        const { data: rest } = await sb
          .from("steps")
          .select("id, position")
          .eq("funnel_id", st.funnel_id)
          .order("position", { ascending: true });
        for (let i = 0; i < (rest || []).length; i++) {
          if (rest[i].position !== i + 1) {
            await sb.from("steps").update({ position: i + 1 }).eq("id", rest[i].id);
          }
        }
        return NextResponse.json({ ok: true });
      }
      case "step.move": {
        const st = await ownedStep(sb, tenantId, body.id);
        if (!st) return bad("Paso no encontrado.", 404);
        const dir = body.direction === "up" ? -1 : 1;
        const { data: all } = await sb
          .from("steps")
          .select("id, position")
          .eq("funnel_id", st.funnel_id)
          .order("position", { ascending: true });
        const idx = all.findIndex((s) => s.id === body.id);
        const swap = all[idx + dir];
        if (!swap) return NextResponse.json({ ok: true });
        const p1 = st.position ?? all[idx].position;
        await sb.from("steps").update({ position: -1 }).eq("id", swap.id);
        await sb.from("steps").update({ position: swap.position }).eq("id", body.id);
        await sb.from("steps").update({ position: p1 }).eq("id", swap.id);
        return NextResponse.json({ ok: true });
      }

      // ── Modules ──
      case "module.create": {
        const st = await ownedStep(sb, tenantId, body.step_id);
        if (!st) return bad("Paso no encontrado.", 404);
        const type = MODULE_TYPE_DEFAULTS[body.type] ? body.type : null;
        if (!type) return bad("Tipo de módulo inválido.");
        const { data: maxRow } = await sb
          .from("modules")
          .select("position")
          .eq("step_id", body.step_id)
          .is("deleted_at", null)
          .order("position", { ascending: false })
          .limit(1)
          .maybeSingle();
        const { data, error } = await sb
          .from("modules")
          .insert({
            step_id: body.step_id,
            position: (maxRow?.position ?? -1) + 1,
            type,
            config: MODULE_TYPE_DEFAULTS[type],
          })
          .select("id")
          .single();
        if (error) throw error;
        return NextResponse.json({ ok: true, id: data.id });
      }
      case "module.update": {
        const mod = await ownedModule(sb, tenantId, body.id);
        if (!mod) return bad("Módulo no encontrado.", 404);
        const patch = {};
        if (body.config != null) {
          if (typeof body.config !== "object") return bad("config debe ser un objeto JSON.");
          patch.config = body.config;
        }
        if (body.gated_by_trigger !== undefined) {
          // null = visible siempre; uuid de trigger = gated
          patch.gated_by_trigger = body.gated_by_trigger || null;
          // Si se des-gatea, limpiar los module_states (revelado) para coherencia futura
          if (!body.gated_by_trigger) {
            await sb.from("module_states").delete().eq("module_id", body.id);
          }
        }
        if (body.position != null) patch.position = Number(body.position);
        const { error } = await sb.from("modules").update(patch).eq("id", body.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "module.delete": {
        const mod = await ownedModule(sb, tenantId, body.id);
        if (!mod) return bad("Módulo no encontrado.", 404);
        const { error } = await sb
          .from("modules")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", body.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      // ── Triggers ──
      case "trigger.create": {
        const st = await ownedStep(sb, tenantId, body.step_id);
        if (!st) return bad("Paso no encontrado.", 404);
        const { data, error } = await sb
          .from("triggers")
          .insert({
            step_id: body.step_id,
            source_module_id: body.source_module_id || null,
            event_type: body.event_type,
            condition: typeof body.condition === "object" && body.condition ? body.condition : {},
            action_type: body.action_type,
            action_config: typeof body.action_config === "object" && body.action_config ? body.action_config : {},
            active: body.active !== false,
          })
          .select("id")
          .single();
        if (error) throw error;
        return NextResponse.json({ ok: true, id: data.id });
      }
      case "trigger.update": {
        const tr = await ownedTrigger(sb, tenantId, body.id);
        if (!tr) return bad("Trigger no encontrado.", 404);
        const patch = {};
        if (body.event_type) patch.event_type = body.event_type;
        if (body.source_module_id !== undefined) patch.source_module_id = body.source_module_id || null;
        if (body.condition !== undefined && typeof body.condition === "object") patch.condition = body.condition;
        if (body.action_type) patch.action_type = body.action_type;
        if (body.action_config !== undefined && typeof body.action_config === "object") patch.action_config = body.action_config;
        if (body.active !== undefined) patch.active = Boolean(body.active);
        const { error } = await sb.from("triggers").update(patch).eq("id", body.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "trigger.delete": {
        const tr = await ownedTrigger(sb, tenantId, body.id);
        if (!tr) return bad("Trigger no encontrado.", 404);
        const { error } = await sb.from("triggers").delete().eq("id", body.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      // ── Forms ──
      case "form.create": {
        const { data, error } = await sb
          .from("forms")
          .insert({ tenant_id: tenantId, title: (body.title || "Nuevo formulario").slice(0, 120) })
          .select("id")
          .single();
        if (error) throw error;
        return NextResponse.json({ ok: true, id: data.id });
      }
      case "form.update": {
        if (!(await assertOwnedForm(sb, tenantId, body.id))) return bad("Formulario no encontrado.", 404);
        const patch = {};
        for (const k of ["title", "description", "submit_label", "consent_label"]) {
          if (body[k] !== undefined) patch[k] = body[k] === null ? null : String(body[k]).slice(0, 2000);
        }
        const { error } = await sb.from("forms").update(patch).eq("id", body.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "question.create": {
        if (!(await assertOwnedForm(sb, tenantId, body.form_id))) return bad("Formulario no encontrado.", 404);
        const { data: maxRow } = await sb
          .from("form_questions")
          .select("position")
          .eq("form_id", body.form_id)
          .order("position", { ascending: false })
          .limit(1)
          .maybeSingle();
        const { data, error } = await sb
          .from("form_questions")
          .insert({
            form_id: body.form_id,
            position: (maxRow?.position || 0) + 1,
            type: ["single_choice", "multi_choice", "short_text", "long_text", "number", "email", "phone", "consent"].includes(body.type)
              ? body.type
              : "single_choice",
            label: (body.label || "Nueva pregunta").slice(0, 500),
            required: body.required !== false,
            config: typeof body.config === "object" && body.config ? body.config : {},
            crm_field_key: body.crm_field_key || null,
          })
          .select("id")
          .single();
        if (error) throw error;
        return NextResponse.json({ ok: true, id: data.id });
      }
      case "question.update": {
        // Verificar pertenencia vía form
        const { data: q } = await sb
          .from("form_questions")
          .select("id, form_id, forms!inner(tenant_id)")
          .eq("id", body.id)
          .maybeSingle();
        if (!q || q.forms?.tenant_id !== tenantId) return bad("Pregunta no encontrada.", 404);
        const patch = {};
        if (body.label != null) patch.label = String(body.label).slice(0, 500);
        if (body.type && ["single_choice", "multi_choice", "short_text", "long_text", "number", "email", "phone", "consent"].includes(body.type))
          patch.type = body.type;
        if (body.required !== undefined) patch.required = Boolean(body.required);
        if (body.config !== undefined && typeof body.config === "object") patch.config = body.config;
        if (body.crm_field_key !== undefined) patch.crm_field_key = body.crm_field_key || null;
        if (body.position != null) patch.position = Number(body.position);
        const { error } = await sb.from("form_questions").update(patch).eq("id", body.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
      case "question.delete": {
        const { data: q } = await sb
          .from("form_questions")
          .select("id, form_id, forms!inner(tenant_id)")
          .eq("id", body.id)
          .maybeSingle();
        if (!q || q.forms?.tenant_id !== tenantId) return bad("Pregunta no encontrada.", 404);
        const { error } = await sb.from("form_questions").delete().eq("id", body.id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      default:
        return bad(`Operación desconocida: ${op}`);
    }
  } catch (e) {
    console.error("[/api/admin/editor]", op, e?.message || e);
    return bad(e?.message || "Error del servidor.", 500);
  }
}
