"use client";

// ─────────────────────────────────────────────────────────────
// /admin/funnel — EDITOR MODULAR (Estrato 3).
//
// Aquí se construye el funnel de CUALQUIER empresa sin tocar código:
//   · pasos: añadir / reordenar / editar textos / borrar
//   · módulos por paso: video, texto, imagen, formulario, botón,
//     descarga, scheduler, html — con config JSON y gating por trigger
//   · triggers: evento → condición → acción (reveal, complete, webhook, CRM)
//   · formularios y sus preguntas (con mapping opcional a CRM)
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import AdminNav, { adminApi } from "../../../components/admin/AdminNav";
import "../admin.css";

const MODULE_TYPES = ["video", "text", "image", "form", "button", "download", "scheduler", "html"];
const EVENT_TYPES = [
  "step_entered",
  "video_started",
  "video_progress",
  "video_ended",
  "module_viewed",
  "form_submitted",
  "button_clicked",
  "appointment_confirmed",
];
const ACTION_TYPES = ["reveal_module", "complete_step", "unlock_step", "send_webhook", "crm_tag", "crm_custom_field"];
const QUESTION_TYPES = ["single_choice", "multi_choice", "short_text", "long_text", "number", "email", "phone", "consent"];

export default function FunnelEditorPage() {
  const [who, setWho] = useState(null);
  const [tree, setTree] = useState(null);
  const [funnelId, setFunnelId] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // edición
  const [openStep, setOpenStep] = useState(null);
  const [stepDraft, setStepDraft] = useState({});
  const [moduleDraft, setModuleDraft] = useState({}); // {id, configText, gated}
  const [newModuleType, setNewModuleType] = useState("video");
  const [triggerDraft, setTriggerDraft] = useState({}); // {stepId: {...}}
  const [formDraft, setFormDraft] = useState({}); // {formId: {...}}
  const [qDraft, setQDraft] = useState({}); // {formId: {...}}

  useEffect(() => {
    (async () => {
      try {
        const me = await adminApi("/api/admin/auth");
        setWho(me.admin);
      } catch (_) {}
    })();
  }, []);

  async function load(fid) {
    try {
      const d = await adminApi(`/api/admin/funnel${fid ? `?funnel_id=${fid}` : ""}`);
      setTree(d);
      if (d.funnel) {
        setFunnelId(d.funnel.id);
        setOpenStep(d.steps[0]?.id || null);
      }
    } catch (e) {
      if (e.message !== "No autorizado") setError(e.message);
    }
  }

  useEffect(() => {
    load(null);
  }, []);

  async function op(payload) {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      await adminApi("/api/admin/editor", { method: "POST", body: JSON.stringify(payload) });
      await load(funnelId);
      setMsg("Guardado ✓");
      setTimeout(() => setMsg(""), 1500);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function openStepEditor(s) {
    setOpenStep(s.id);
    setStepDraft({
      id: s.id,
      tab_label: s.tab_label,
      short_label: s.short_label,
      side_title: s.side_title,
      side_sub: s.side_sub,
      headline: s.headline,
    });
  }

  function editModule(m, step) {
    setModuleDraft({
      id: m.id,
      type: m.type,
      configText: JSON.stringify(m.config || {}, null, 2),
      gated: m.gated_by_trigger || "",
      stepId: step.id,
    });
  }

  function parseJson(text, fallback) {
    try {
      return JSON.parse(text || "{}");
    } catch {
      return fallback;
    }
  }

  if (!tree && !error) {
    return (
      <div className="admin-root">
        <AdminNav email={who?.email} />
        <main className="admin-main">
          <p className="admin-sub">Cargando editor…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-root">
      <AdminNav email={who?.email} />
      <main className="admin-main">
        <h1 className="admin-h1">Editor de funnel</h1>
        <p className="admin-sub">
          Pasos, módulos, triggers y formularios. Todo se guarda en Supabase y el portal lo renderiza al instante.
        </p>

        {error && <div className="admin-error">{error}</div>}
        {msg && <div className="admin-ok">{msg}</div>}

        {/* ── Selector de funnel ── */}
        <div className="admin-panel">
          <div className="admin-row">
            <select
              className="admin-select"
              style={{ maxWidth: 320 }}
              value={funnelId || ""}
              onChange={(e) => {
                setFunnelId(e.target.value);
                load(e.target.value);
              }}
            >
              {(tree?.funnels || []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title} ({f.status})
                </option>
              ))}
            </select>
            <button
              className="admin-btn ghost"
              onClick={() => op({ op: "funnel.create", title: "Nuevo funnel" }).then(() => load(null))}
              disabled={busy}
            >
              + Nuevo funnel
            </button>
            {tree?.funnel && (
              <>
                <button
                  className={`admin-btn ${tree.funnel.status === "published" ? "ghost" : "red"}`}
                  disabled={busy}
                  onClick={() =>
                    op({
                      op: "funnel.update",
                      id: tree.funnel.id,
                      status: tree.funnel.status === "published" ? "draft" : "published",
                    })
                  }
                >
                  {tree.funnel.status === "published" ? "Pasar a borrador" : "Publicar"}
                </button>
                <span className="admin-sub" style={{ margin: 0 }}>
                  slug: <span className="admin-mono">{tree.funnel.slug}</span>
                </span>
              </>
            )}
          </div>
        </div>

        {!tree?.funnel ? (
          <div className="admin-panel">
            <p className="admin-sub">Crea un funnel para empezar.</p>
          </div>
        ) : (
          <>
            {/* ── Pasos ── */}
            <div className="admin-panel">
              <div className="admin-row" style={{ justifyContent: "space-between" }}>
                <h2 style={{ margin: 0 }}>Pasos ({tree.steps.length})</h2>
                <button className="admin-btn" disabled={busy} onClick={() => op({ op: "step.create", funnel_id: tree.funnel.id })}>
                  + Añadir paso
                </button>
              </div>

              {tree.steps.map((s, idx) => (
                <div key={s.id} style={{ border: "1px solid #e3e7f2", borderRadius: 10, padding: "12px 14px", margin: "10px 0" }}>
                  <div className="admin-row" style={{ justifyContent: "space-between" }}>
                    <strong>
                      {s.position}. {s.tab_label}{" "}
                      <span style={{ color: "#5a6280", fontWeight: 400 }}>
                        · {s.modules.length} módulo(s) · {s.triggers.length} trigger(s)
                      </span>
                    </strong>
                    <div className="admin-row">
                      <button className="admin-btn ghost small" disabled={busy || idx === 0} onClick={() => op({ op: "step.move", id: s.id, direction: "up" })}>
                        ↑
                      </button>
                      <button className="admin-btn ghost small" disabled={busy || idx === tree.steps.length - 1} onClick={() => op({ op: "step.move", id: s.id, direction: "down" })}>
                        ↓
                      </button>
                      <button className="admin-btn ghost small" onClick={() => (openStep === s.id ? setOpenStep(null) : openStepEditor(s))}>
                        {openStep === s.id ? "Cerrar" : "Editar"}
                      </button>
                      <button
                        className="admin-btn ghost small"
                        disabled={busy}
                        onClick={() => confirm(`¿Borrar el paso "${s.tab_label}" y todo su contenido?`) && op({ op: "step.delete", id: s.id })}
                      >
                        Borrar
                      </button>
                    </div>
                  </div>

                  {openStep === s.id && (
                    <div style={{ marginTop: 12 }}>
                      {/* Campos del paso */}
                      <div className="admin-row">
                        {[
                          ["tab_label", "Pestaña"],
                          ["short_label", "Corto"],
                          ["side_title", "Lateral"],
                          ["side_sub", "Sub lateral"],
                          ["headline", "Título del paso"],
                        ].map(([k, label]) => (
                          <div key={k} style={{ flex: 1, minWidth: 150 }}>
                            <label className="admin-label">{label}</label>
                            <input
                              className="admin-input"
                              value={stepDraft[k] ?? ""}
                              onChange={(e) => setStepDraft({ ...stepDraft, [k]: e.target.value })}
                            />
                          </div>
                        ))}
                        <div style={{ alignSelf: "flex-end" }}>
                          <button className="admin-btn small" disabled={busy} onClick={() => op({ op: "step.update", ...stepDraft })}>
                            Guardar textos
                          </button>
                        </div>
                      </div>

                      {/* Módulos */}
                      <h3 style={{ fontSize: 14, margin: "16px 0 8px" }}>Módulos</h3>
                      {s.modules.map((m) => (
                        <div key={m.id} style={{ background: "#f7f9fe", borderRadius: 8, padding: "8px 12px", margin: "6px 0" }}>
                          <div className="admin-row" style={{ justifyContent: "space-between" }}>
                            <span>
                              <span className="admin-badge neutral">{m.type}</span>{" "}
                              pos {m.position}{" "}
                              {m.gated_by_trigger ? <span className="admin-badge bad">gated</span> : null}{" "}
                              <span className="admin-mono">{m.id.slice(0, 8)}…</span>
                            </span>
                            <div className="admin-row">
                              <button className="admin-btn ghost small" onClick={() => (moduleDraft.id === m.id ? setModuleDraft({}) : editModule(m, s))}>
                                {moduleDraft.id === m.id ? "Cerrar" : "Editar"}
                              </button>
                              <button
                                className="admin-btn ghost small"
                                disabled={busy}
                                onClick={() => confirm("¿Borrar este módulo?") && op({ op: "module.delete", id: m.id })}
                              >
                                Borrar
                              </button>
                            </div>
                          </div>

                          {moduleDraft.id === m.id && (
                            <div style={{ marginTop: 10 }}>
                              <label className="admin-label">Config JSON</label>
                              <textarea
                                className="admin-textarea"
                                value={moduleDraft.configText}
                                onChange={(e) => setModuleDraft({ ...moduleDraft, configText: e.target.value })}
                              />
                              {m.type === "form" && (
                                <div className="admin-sub" style={{ margin: "6px 0" }}>
                                  form_id debe apuntar a un formulario (sección Formularios, más abajo).
                                </div>
                              )}
                              <label className="admin-label">Gating (trigger que lo revela)</label>
                              <select
                                className="admin-select"
                                value={moduleDraft.gated}
                                onChange={(e) => setModuleDraft({ ...moduleDraft, gated: e.target.value })}
                              >
                                <option value="">— visible siempre —</option>
                                {s.triggers
                                  .filter((t) => t.action_type === "reveal_module")
                                  .map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.event_type} → reveal ({t.id.slice(0, 8)}…)
                                    </option>
                                  ))}
                              </select>
                              <div className="admin-row" style={{ marginTop: 10 }}>
                                <button
                                  className="admin-btn small"
                                  disabled={busy}
                                  onClick={() =>
                                    op({
                                      op: "module.update",
                                      id: m.id,
                                      config: parseJson(moduleDraft.configText, m.config),
                                      gated_by_trigger: moduleDraft.gated || null,
                                    })
                                  }
                                >
                                  Guardar módulo
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      <div className="admin-row" style={{ marginTop: 8 }}>
                        <select className="admin-select" style={{ maxWidth: 180 }} value={newModuleType} onChange={(e) => setNewModuleType(e.target.value)}>
                          {MODULE_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                        <button className="admin-btn small" disabled={busy} onClick={() => op({ op: "module.create", step_id: s.id, type: newModuleType })}>
                          + Añadir módulo
                        </button>
                      </div>

                      {/* Triggers */}
                      <h3 style={{ fontSize: 14, margin: "16px 0 8px" }}>Triggers</h3>
                      {s.triggers.map((t) => (
                        <div key={t.id} style={{ background: "#f7f9fe", borderRadius: 8, padding: "8px 12px", margin: "6px 0" }}>
                          <div className="admin-row" style={{ justifyContent: "space-between" }}>
                            <span>
                              <span className="admin-badge neutral">{t.event_type}</span> →{" "}
                              <strong>{t.action_type}</strong>{" "}
                              <span className="admin-mono">{JSON.stringify(t.action_config)}</span>{" "}
                              {t.condition && Object.keys(t.condition).length > 0 ? (
                                <span className="admin-mono">cond: {JSON.stringify(t.condition)}</span>
                              ) : null}{" "}
                              {!t.active && <span className="admin-badge bad">inactivo</span>}
                            </span>
                            <div className="admin-row">
                              <button
                                className="admin-btn ghost small"
                                disabled={busy}
                                onClick={() => op({ op: "trigger.update", id: t.id, active: !t.active })}
                              >
                                {t.active ? "Desactivar" : "Activar"}
                              </button>
                              <button
                                className="admin-btn ghost small"
                                disabled={busy}
                                onClick={() => confirm("¿Borrar este trigger?") && op({ op: "trigger.delete", id: t.id })}
                              >
                                Borrar
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Nuevo trigger */}
                      <NewTriggerForm
                        draft={triggerDraft[s.id] || { event_type: "video_ended", action_type: "reveal_module", conditionText: "{}", configText: "{}", source_module_id: "" }}
                        setDraft={(d) => setTriggerDraft({ ...triggerDraft, [s.id]: d })}
                        modules={s.modules}
                        busy={busy}
                        onCreate={() => {
                          const d = triggerDraft[s.id] || {};
                          return op({
                            op: "trigger.create",
                            step_id: s.id,
                            event_type: d.event_type,
                            action_type: d.action_type,
                            source_module_id: d.source_module_id || null,
                            condition: parseJson(d.conditionText, {}),
                            action_config: parseJson(d.configText, {}),
                          });
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ── Formularios ── */}
            <div className="admin-panel">
              <div className="admin-row" style={{ justifyContent: "space-between" }}>
                <h2 style={{ margin: 0 }}>Formularios</h2>
                <button className="admin-btn" disabled={busy} onClick={() => op({ op: "form.create", title: "Nuevo formulario" })}>
                  + Nuevo formulario
                </button>
              </div>

              {(tree.forms || []).map((f) => {
                const fd = formDraft[f.id] || {
                  title: f.title,
                  description: f.description,
                  submit_label: f.submit_label,
                  consent_label: f.consent_label || "",
                };
                return (
                  <div key={f.id} style={{ border: "1px solid #e3e7f2", borderRadius: 10, padding: "12px 14px", margin: "10px 0" }}>
                    <div className="admin-row">
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <label className="admin-label">Título</label>
                        <input className="admin-input" value={fd.title} onChange={(e) => setFormDraft({ ...formDraft, [f.id]: { ...fd, title: e.target.value } })} />
                      </div>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <label className="admin-label">Texto del botón</label>
                        <input className="admin-input" value={fd.submit_label || ""} onChange={(e) => setFormDraft({ ...formDraft, [f.id]: { ...fd, submit_label: e.target.value } })} />
                      </div>
                      <div style={{ alignSelf: "flex-end" }}>
                        <button className="admin-btn small" disabled={busy} onClick={() => op({ op: "form.update", id: f.id, ...fd, consent_label: fd.consent_label || null })}>
                          Guardar
                        </button>
                      </div>
                    </div>
                    <label className="admin-label">Descripción</label>
                    <input className="admin-input" value={fd.description || ""} onChange={(e) => setFormDraft({ ...formDraft, [f.id]: { ...fd, description: e.target.value } })} />
                    <label className="admin-label">Texto del consentimiento (vacío = sin pantalla de acuerdo)</label>
                    <textarea className="admin-textarea" style={{ minHeight: 60 }} value={fd.consent_label || ""} onChange={(e) => setFormDraft({ ...formDraft, [f.id]: { ...fd, consent_label: e.target.value } })} />

                    <h3 style={{ fontSize: 14, margin: "14px 0 8px" }}>Preguntas ({f.questions.length})</h3>
                    {f.questions.map((q) => {
                      const isChoice = q.type === "single_choice" || q.type === "multi_choice";
                      return (
                        <QuestionEditor
                          key={q.id}
                          q={q}
                          busy={busy}
                          onSave={(payload) => op({ op: "question.update", id: q.id, ...payload })}
                          onDelete={() => op({ op: "question.delete", id: q.id })}
                          isChoice={isChoice}
                        />
                      );
                    })}

                    <NewQuestionForm
                      draft={qDraft[f.id] || { label: "", type: "single_choice", optionsText: "", required: true, crm_field_key: "" }}
                      setDraft={(d) => setQDraft({ ...qDraft, [f.id]: d })}
                      busy={busy}
                      onCreate={() => {
                        const d = qDraft[f.id] || {};
                        return op({
                          op: "question.create",
                          form_id: f.id,
                          label: d.label,
                          type: d.type,
                          required: d.required,
                          crm_field_key: d.crm_field_key || null,
                          config: d.type === "single_choice" || d.type === "multi_choice"
                            ? { options: (d.optionsText || "").split("\n").map((x) => x.trim()).filter(Boolean) }
                            : {},
                        });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function NewTriggerForm({ draft, setDraft, modules, busy, onCreate }) {
  return (
    <div style={{ background: "#f7f9fe", borderRadius: 8, padding: "10px 12px", marginTop: 8 }}>
      <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>Nuevo trigger</h3>
      <div className="admin-row">
        <div style={{ minWidth: 160 }}>
          <label className="admin-label">Evento</label>
          <select className="admin-select" value={draft.event_type} onChange={(e) => setDraft({ ...draft, event_type: e.target.value })}>
            {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <label className="admin-label">Módulo origen (opcional)</label>
          <select className="admin-select" value={draft.source_module_id || ""} onChange={(e) => setDraft({ ...draft, source_module_id: e.target.value })}>
            <option value="">— cualquier módulo —</option>
            {modules.map((m) => <option key={m.id} value={m.id}>{m.type} ({m.id.slice(0, 8)}…)</option>)}
          </select>
        </div>
        <div style={{ minWidth: 170 }}>
          <label className="admin-label">Acción</label>
          <select className="admin-select" value={draft.action_type} onChange={(e) => setDraft({ ...draft, action_type: e.target.value })}>
            {ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 150 }}>
          <label className="admin-label">Condición JSON</label>
          <input className="admin-input admin-mono" value={draft.conditionText} onChange={(e) => setDraft({ ...draft, conditionText: e.target.value })} placeholder='{"pct_gte":50}' />
        </div>
        <div style={{ flex: 1, minWidth: 150 }}>
          <label className="admin-label">Config de acción JSON</label>
          <input className="admin-input admin-mono" value={draft.configText} onChange={(e) => setDraft({ ...draft, configText: e.target.value })} placeholder='{"module_id":"…"}' />
        </div>
        <div style={{ alignSelf: "flex-end" }}>
          <button className="admin-btn small" disabled={busy} onClick={onCreate}>
            + Crear
          </button>
        </div>
      </div>
      <div className="admin-sub" style={{ margin: "6px 0 0" }}>
        Ejemplos de config: reveal_module → {"{"}"module_id":"uuid del módulo"{"}"} · crm_tag → {"{"}"tag":"paso_1_completado"{"}"} · send_webhook → {"{"}"url":"https://…"{"}"}
      </div>
    </div>
  );
}

function QuestionEditor({ q, busy, onSave, onDelete, isChoice }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState({
    label: q.label,
    type: q.type,
    required: q.required,
    crm_field_key: q.crm_field_key || "",
    optionsText: (q.config?.options || []).join("\n"),
  });

  return (
    <div style={{ background: "#f7f9fe", borderRadius: 8, padding: "8px 12px", margin: "6px 0" }}>
      <div className="admin-row" style={{ justifyContent: "space-between" }}>
        <span>
          <strong>{q.position}.</strong> {q.label}{" "}
          <span className="admin-badge neutral">{q.type}</span>{" "}
          {q.required ? <span className="admin-badge ok">requerida</span> : <span className="admin-badge neutral">opcional</span>}{" "}
          {q.crm_field_key ? <span className="admin-badge neutral">crm: {q.crm_field_key}</span> : null}
        </span>
        <div className="admin-row">
          <button className="admin-btn ghost small" onClick={() => setOpen(!open)}>
            {open ? "Cerrar" : "Editar"}
          </button>
          <button className="admin-btn ghost small" disabled={busy} onClick={() => confirm("¿Borrar pregunta?") && onDelete()}>
            Borrar
          </button>
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 8 }}>
          <label className="admin-label">Pregunta</label>
          <input className="admin-input" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} />
          <div className="admin-row" style={{ marginTop: 8 }}>
            <div style={{ minWidth: 170 }}>
              <label className="admin-label">Tipo</label>
              <select className="admin-select" value={d.type} onChange={(e) => setD({ ...d, type: e.target.value })}>
                {QUESTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ minWidth: 140 }}>
              <label className="admin-label" style={{ display: "flex", gap: 6, alignItems: "center", textTransform: "none" }}>
                <input type="checkbox" checked={d.required} onChange={(e) => setD({ ...d, required: e.target.checked })} />
                Requerida
              </label>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label className="admin-label">CRM field key (opcional)</label>
              <input className="admin-input" value={d.crm_field_key} onChange={(e) => setD({ ...d, crm_field_key: e.target.value })} />
            </div>
          </div>
          {isChoice && (
            <>
              <label className="admin-label">Opciones (una por línea)</label>
              <textarea className="admin-textarea" style={{ minHeight: 80 }} value={d.optionsText} onChange={(e) => setD({ ...d, optionsText: e.target.value })} />
            </>
          )}
          <div className="admin-row" style={{ marginTop: 8 }}>
            <button
              className="admin-btn small"
              disabled={busy}
              onClick={() =>
                onSave({
                  label: d.label,
                  type: d.type,
                  required: d.required,
                  crm_field_key: d.crm_field_key || null,
                  config: isChoice ? { options: (d.optionsText || "").split("\n").map((x) => x.trim()).filter(Boolean) } : q.config,
                })
              }
            >
              Guardar pregunta
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewQuestionForm({ draft, setDraft, busy, onCreate }) {
  const isChoice = draft.type === "single_choice" || draft.type === "multi_choice";
  return (
    <div style={{ borderRadius: 8, border: "1px dashed #c9d1e8", padding: "10px 12px", marginTop: 8 }}>
      <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>Nueva pregunta</h3>
      <label className="admin-label">Pregunta</label>
      <input className="admin-input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
      <div className="admin-row" style={{ marginTop: 8 }}>
        <div style={{ minWidth: 170 }}>
          <label className="admin-label">Tipo</label>
          <select className="admin-select" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
            {QUESTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ minWidth: 140 }}>
          <label className="admin-label" style={{ display: "flex", gap: 6, alignItems: "center", textTransform: "none" }}>
            <input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} />
            Requerida
          </label>
        </div>
        <div style={{ flex: 1, minWidth: 150 }}>
          <label className="admin-label">CRM field key (opcional)</label>
          <input className="admin-input" value={draft.crm_field_key} onChange={(e) => setDraft({ ...draft, crm_field_key: e.target.value })} />
        </div>
      </div>
      {isChoice && (
        <>
          <label className="admin-label">Opciones (una por línea)</label>
          <textarea className="admin-textarea" style={{ minHeight: 80 }} value={draft.optionsText} onChange={(e) => setDraft({ ...draft, optionsText: e.target.value })} />
        </>
      )}
      <div className="admin-row" style={{ marginTop: 8 }}>
        <button className="admin-btn small" disabled={busy || !draft.label} onClick={onCreate}>
          + Añadir pregunta
        </button>
      </div>
    </div>
  );
}
