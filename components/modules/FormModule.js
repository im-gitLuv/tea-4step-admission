"use client";

// ─────────────────────────────────────────────────────────────
// FormModule — wizard de formulario 100 % data-driven (Estrato 2).
//
// Recibe el form + questions desde el estado del portal (viene del
// editor admin / Supabase). Tipos soportados:
//   single_choice · multi_choice · short_text · long_text
//   number · email · phone · consent
//
// Envía POST /api/form { formId, moduleId, answers: {question_id: valor} }
// y llama onComplete() cuando el servidor confirma (el servidor además
// dispara los triggers y completa el paso si el módulo lo pide).
// ─────────────────────────────────────────────────────────────

import { useState } from "react";

export default function FormModule({ module, form, onComplete }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const questions = (form?.questions || []).filter((q) => q.type !== "consent");
  const consentLabel = form?.consentLabel || null;
  const total = questions.length;
  const hasConsent = Boolean(consentLabel);
  const onAgreementScreen = hasConsent && step === total;
  const finishedAll = !hasConsent && step >= total; // sin consent: pantalla final es el submit
  const currentQ = !onAgreementScreen && step < total ? questions[step] : null;
  const currentAnswer = currentQ ? answers[currentQ.id] : null;

  function setValue(id, value) {
    setError("");
    setAnswers((a) => ({ ...a, [id]: value }));
  }

  function validateCurrent() {
    if (!currentQ) return true;
    const v = answers[currentQ.id];
    const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    if (currentQ.required && empty) {
      setError("Completa esta pregunta para continuar.");
      return false;
    }
    if (currentQ.type === "email" && !empty && !String(v).includes("@")) {
      setError("Escribe un correo válido.");
      return false;
    }
    return true;
  }

  function next() {
    if (!validateCurrent()) return;
    setError("");
    setStep((s) => s + 1);
  }

  function back() {
    setError("");
    setStep((s) => Math.max(0, s - 1));
  }

  async function submit() {
    if (hasConsent && !agreed) {
      setError("Debes marcar la casilla de confirmación para enviar.");
      return;
    }
    if (currentQ && !validateCurrent()) return;

    // Si hay preguntas sin consent-screen y estamos en la última, validar todas requeridas
    for (const q of questions) {
      if (q.required) {
        const v = answers[q.id];
        const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
        if (empty) {
          setError("Faltan respuestas obligatorias.");
          return;
        }
      }
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formId: form.id,
          moduleId: module.id,
          answers,
          agreed: hasConsent ? true : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No pudimos guardar tus respuestas.");
      }
      if (typeof onComplete === "function") onComplete();
    } catch (e) {
      setError(e.message || "Ocurrió un error. Intenta de nuevo.");
      setSubmitting(false);
    }
  }

  if (!form) {
    return <div className="disclaimer">Formulario no configurado (edítalo en el admin).</div>;
  }
  if (total === 0) {
    return <div className="disclaimer">Este formulario todavía no tiene preguntas.</div>;
  }

  const progressPct = Math.round((Math.min(step, total) / total) * 100);
  const showFinalActions = onAgreementScreen || finishedAll;

  return (
    <div className="fw-root">
      <style>{CSS}</style>

      {/* Barra de progreso + contador */}
      <div className="fw-topbar">
        <div className="fw-counter">
          {onAgreementScreen
            ? "Último paso"
            : step >= total
            ? "Listo para enviar"
            : `Pregunta ${step + 1} de ${total}`}
        </div>
        <div className="fw-progress">
          <div className="fw-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {showFinalActions ? (
        <div className="fw-card">
          {form.title && <p className="fw-stem">{form.title}</p>}
          {form.description && <p style={{ color: "#4a5170", fontSize: 14, marginTop: 0 }}>{form.description}</p>}
          {hasConsent && (
            <label className="fw-agree">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>{consentLabel}</span>
            </label>
          )}
          {error && <div className="fw-error">{error}</div>}
          <div className="fw-actions">
            <button className="fw-btn fw-btn-ghost" onClick={back} disabled={submitting}>
              Atrás
            </button>
            <button
              className="fw-btn fw-btn-primary"
              onClick={submit}
              disabled={submitting || (hasConsent && !agreed)}
            >
              {submitting ? "Enviando…" : form.submitLabel || "Enviar"}
            </button>
          </div>
        </div>
      ) : (
        <div className="fw-card">
          <p className="fw-stem">{currentQ.label}</p>
          <QuestionInput question={currentQ} value={currentAnswer} onChange={(v) => setValue(currentQ.id, v)} />
          {error && <div className="fw-error">{error}</div>}
          <div className="fw-actions">
            <button className="fw-btn fw-btn-ghost" onClick={back} disabled={step === 0}>
              Atrás
            </button>
            <button className="fw-btn fw-btn-primary" onClick={next}>
              {step === total - 1 ? "Continuar" : "Siguiente"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionInput({ question, value, onChange }) {
  const q = question;
  const opts = (q.config?.options || []).map(String);

  if (q.type === "single_choice") {
    return (
      <div className="fw-opts">
        {opts.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`fw-opt ${value === opt ? "is-selected" : ""}`}
            onClick={() => onChange(opt)}
          >
            <span className="fw-radio" />
            <span className="fw-opt-label">{opt}</span>
          </button>
        ))}
      </div>
    );
  }

  if (q.type === "multi_choice") {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div className="fw-opts">
        {opts.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`fw-opt ${arr.includes(opt) ? "is-selected" : ""}`}
            onClick={() => onChange(arr.includes(opt) ? arr.filter((x) => x !== opt) : [...arr, opt])}
          >
            <span className="fw-radio" style={{ borderRadius: 5 }} />
            <span className="fw-opt-label">{opt}</span>
          </button>
        ))}
      </div>
    );
  }

  if (q.type === "long_text") {
    return (
      <textarea
        className="fw-input"
        rows={4}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Escribe tu respuesta…"
      />
    );
  }

  // short_text · number · email · phone
  const typeMap = { number: "number", email: "email", phone: "tel" };
  return (
    <input
      className="fw-input"
      type={typeMap[q.type] || "text"}
      value={typeof value === "string" || typeof value === "number" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={q.type === "email" ? "tu@correo.com" : q.type === "phone" ? "+58 …" : "Escribe aquí…"}
    />
  );
}

// Estilos con tokens de marca (via CSS vars que el portal inyecta del brand).
const CSS = `
.fw-root{font-family:'Work Sans',system-ui,-apple-system,sans-serif;max-width:640px;margin:0 auto;width:100%}
.fw-topbar{margin-bottom:18px}
.fw-counter{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--tea-blue);margin-bottom:8px}
.fw-progress{height:6px;background:#e9edf7;border-radius:99px;overflow:hidden}
.fw-progress-fill{height:100%;background:var(--tea-red);border-radius:99px;transition:width .3s ease}
.fw-card{background:#fff;border:1px solid #ebebeb;border-radius:14px;padding:22px 20px;box-shadow:0 1px 5px rgba(87,100,126,.10)}
.fw-stem{color:var(--tea-dark);font-size:16px;font-weight:600;line-height:1.45;margin:0 0 16px}
.fw-opts{display:flex;flex-direction:column;gap:10px}
.fw-opt{display:flex;align-items:center;gap:12px;width:100%;text-align:left;cursor:pointer;
  background:#fff;border:1.5px solid #e0e0e0;border-radius:10px;padding:13px 14px;transition:all .15s;font-family:inherit}
.fw-opt:hover{border-color:var(--tea-blue);background:#eef1fb}
.fw-opt.is-selected{border-color:var(--tea-red);background:#ffeaee}
.fw-radio{flex:0 0 auto;width:16px;height:16px;border-radius:50%;border:2px solid var(--tea-blue);background:#fff;position:relative}
.fw-opt.is-selected .fw-radio{border-color:var(--tea-red);background:var(--tea-red);box-shadow:inset 0 0 0 3px #fff}
.fw-opt-label{color:var(--tea-dark);font-size:14px;font-weight:400;line-height:1.35}
.fw-opt.is-selected .fw-opt-label{font-weight:500}
.fw-input{width:100%;box-sizing:border-box;font-family:inherit;font-size:15px;color:var(--tea-dark);
  border:1.5px solid #e0e0e0;border-radius:10px;padding:13px 14px;outline:none;transition:border .15s}
.fw-input:focus{border-color:var(--tea-blue)}
.fw-agree{display:flex;align-items:flex-start;gap:12px;cursor:pointer;background:#f7f9fe;border:1px solid #e0e6f5;border-radius:10px;padding:16px}
.fw-agree input{margin-top:2px;width:18px;height:18px;accent-color:var(--tea-red);flex:0 0 auto;cursor:pointer}
.fw-agree span{color:var(--tea-dark);font-size:13.5px;line-height:1.5}
.fw-error{color:var(--tea-red);font-size:13px;font-weight:500;margin-top:12px}
.fw-actions{display:flex;gap:10px;justify-content:space-between;margin-top:20px}
.fw-btn{font-family:inherit;font-size:14px;font-weight:700;border-radius:8px;padding:12px 22px;cursor:pointer;border:none;transition:background .15s,opacity .15s}
.fw-btn:disabled{opacity:.45;cursor:not-allowed}
.fw-btn-ghost{background:#fff;color:var(--tea-blue);border:1.5px solid #d3d9ea}
.fw-btn-ghost:not(:disabled):hover{background:#eef1fb}
.fw-btn-primary{background:var(--tea-red);color:#fff;text-transform:uppercase;letter-spacing:.05em;flex:1}
.fw-btn-primary:not(:disabled):hover{background:var(--tea-dark)}
@media(max-width:480px){.fw-card{padding:18px 14px}.fw-btn{padding:12px 16px}}
`;
