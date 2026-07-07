'use client';

import { useState } from 'react';

/**
 * FormWizard — Step 3 de admisión (Bloque D)
 *
 * Wizard de una pregunta por pantalla. Al terminar escribe los 10 custom fields
 * al contacto de GHL (por ID, no por key) y dispara el tag paso_3_completado.
 *
 * IMPORTANTE sobre GHL: las opciones de cada pregunta son campos RADIO. El valor
 * que se escribe de vuelta DEBE coincidir textualmente con las picklistOptions
 * del campo en GHL, o el valor puede quedar fuera de lista. Por eso las `opts`
 * de abajo son verbatim del picklist. No las "mejores" sin actualizar GHL también.
 *
 * Props:
 *   contactId    (string, requerido) — id del contacto en GHL
 *   onComplete   (fn)  — se llama tras guardar OK; el portal la usa para desbloquear el paso 4
 *   defaultValues(obj) — opcional, respuestas previas keyed por fieldId (prefill)
 */

// Orden final definido por Luis (10 preguntas). id = custom field id en GHL.
const QUESTIONS = [
  {
    id: 'FmdxtrfAXQhR2W8JDyXZ',
    key: 'motivacion',
    stem: '¿Cuál es tu principal motivación para dominar el inglés ahora?',
    opts: [
      'Conseguir un ascenso o un trabajo mejor pagado',
      'Sentirme libre y seguro en conversaciones del día a día',
      'Poder negociar, pedir aumentos y hablar con mis jefes',
      'Ya no quiero quedarme callado mientras otros avanzan',
      'Quiero que mi familia vea un cambio real en mí',
    ],
  },
  {
    id: 'KMGZIzSLO1r5SwAY2Ntl',
    key: 'situacion_actual',
    stem: 'Lo que mejor describe tu situación actual es:',
    opts: [
      'El inglés me está frenando económica y profesionalmente',
      'Gano lo suficiente pero podría ganar mucho más con inglés',
      'Tengo buen trabajo pero no puedo crecer sin el inglés',
      'Quiero cambiar de trabajo pero el inglés es mi mayor barrera',
    ],
  },
  {
    id: 'VLcSkWWFLpRKvb2mjAID',
    key: 'seguridad',
    stem: '¿Sientes que hablar inglés con fluidez te permitirá alcanzar esos objetivos y metas?',
    opts: [
      'Sí, estoy convencido de eso',
      'Creo que sí, aunque tengo dudas',
      'No estoy seguro',
    ],
  },
  {
    id: 'ZvTvkbQVliLxsMeIWtcI',
    key: 'dedicacion_tiempo',
    stem: '¿Puedes dedicar un mínimo de 45 minutos al día (3 a 6 horas semanales) al programa?',
    opts: [
      'Sí, sin problema',
      'Tendré que ajustar mi rutina pero sí puedo',
      'No estoy seguro',
    ],
  },
  {
    id: 'uyqRosmNaQqVptWhn0PB',
    key: 'seriedad',
    stem: 'Un requisito de Talk English Academy es que debes ser serio, enseñable y estar dispuesto a practicar aunque al principio te equivoques. ¿Eso te describe?',
    opts: [
      'Sí, eso me describe perfectamente',
      'Creo que sí',
      'No estoy seguro',
    ],
  },
  {
    id: 'UPcalcyHGEbk37BuDoyS',
    key: 'compromiso_enfoque',
    stem: '¿Te comprometes a asistir a tus sesiones con total atención, sin distracciones de familia, trabajo o redes sociales?',
    opts: ['Sí, me comprometo', 'Lo intentaré', 'Me será difícil'],
  },
  {
    id: 'LP0Pa6WIuzV2uZrdT3Rc',
    key: 'disciplina',
    stem: '¿Puedes avanzar de forma autónoma entre sesiones sin necesitar que estemos recordándote cada tarea?',
    opts: [
      'Sí, soy autodisciplinado',
      'Necesito cierto seguimiento pero me esfuerzo',
      'Necesito mucho apoyo externo',
    ],
  },
  {
    id: 'CNMfPPAfXy2Sn9dZITUp',
    key: 'voz',
    stem: '¿Estás dispuesto a completar ejercicios entre sesiones como conversaciones en voz, grabaciones y práctica diaria?',
    opts: [
      'Sí, entiendo que eso es parte del proceso',
      'Depende del tipo de tarea',
      'Prefiero solo las sesiones en vivo',
    ],
  },
  {
    id: 'iPcAqybHC06E46jhyp98',
    key: 'compromiso_decision',
    stem: '¿Estás lo suficientemente comprometido con tus metas como para tomar una decisión hoy si el programa es lo que necesitas?',
    opts: ['Sí, estoy listo para decidir', 'Necesito pensarlo un poco más'],
  },
  {
    id: 'BwZoWH4kcEuxWM8u676Y',
    key: 'tipo_de_pago',
    stem:
      'En tu cita, nuestro Oficial de Admisiones completará tu inscripción y te dará acceso al portal de estudiantes de Talk English Academy. Para agilizar ese proceso, indícanos cómo se cubrirá tu matrícula:',
    // Verbatim del picklist actual en GHL (solo 2 opciones). Si reañades PayPal/Binance
    // al picklist en GHL, agrégalos aquí también.
    opts: ['Zelle', 'Necesito explorar opciones de pago'],
  },
];

const AGREEMENT_TEXT =
  'Confirmo que mis respuestas son verdaderas y que me comprometo —por mí mismo/a o en representación del estudiante a mi cargo— a cumplir los requisitos del programa y a respaldar el pago de la matrícula en mi cita de admisión.';

export default function FormWizard({ contactId, onComplete, defaultValues = {} }) {
  // step: 0..QUESTIONS.length-1 son preguntas; QUESTIONS.length es la pantalla de acuerdo
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(defaultValues);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const total = QUESTIONS.length;
  const onAgreementScreen = step === total;
  const currentQ = onAgreementScreen ? null : QUESTIONS[step];
  const currentAnswer = currentQ ? answers[currentQ.id] : null;

  function select(value) {
    setError('');
    setAnswers((a) => ({ ...a, [currentQ.id]: value }));
  }

  function next() {
    if (!onAgreementScreen && !currentAnswer) {
      setError('Selecciona una opción para continuar.');
      return;
    }
    setError('');
    setStep((s) => Math.min(s + 1, total));
  }

  function back() {
    setError('');
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    if (!agreed) {
      setError('Debes marcar la casilla de confirmación para enviar.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, answers, agreed: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No pudimos guardar tus respuestas.');
      }
      if (typeof onComplete === 'function') onComplete();
    } catch (e) {
      setError(e.message || 'Ocurrió un error. Intenta de nuevo.');
      setSubmitting(false);
    }
  }

  const progressPct = Math.round((step / total) * 100);

  return (
    <div className="fw-root">
      <style>{CSS}</style>

      {/* Barra de progreso + contador */}
      <div className="fw-topbar">
        <div className="fw-counter">
          {onAgreementScreen ? 'Último paso' : `Pregunta ${step + 1} de ${total}`}
        </div>
        <div className="fw-progress">
          <div className="fw-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {onAgreementScreen ? (
        <div className="fw-card">
          <p className="fw-stem">Antes de enviar tu aplicación</p>
          <label className="fw-agree">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>{AGREEMENT_TEXT}</span>
          </label>
          {error && <div className="fw-error">{error}</div>}
          <div className="fw-actions">
            <button className="fw-btn fw-btn-ghost" onClick={back} disabled={submitting}>
              Atrás
            </button>
            <button
              className="fw-btn fw-btn-primary"
              onClick={submit}
              disabled={!agreed || submitting}
            >
              {submitting ? 'Enviando…' : 'Enviar aplicación'}
            </button>
          </div>
        </div>
      ) : (
        <div className="fw-card">
          <p className="fw-stem">{currentQ.stem}</p>
          <div className="fw-opts">
            {currentQ.opts.map((opt) => (
              <button
                key={opt}
                type="button"
                className={`fw-opt ${currentAnswer === opt ? 'is-selected' : ''}`}
                onClick={() => select(opt)}
              >
                <span className="fw-radio" />
                <span className="fw-opt-label">{opt}</span>
              </button>
            ))}
          </div>
          {error && <div className="fw-error">{error}</div>}
          <div className="fw-actions">
            <button
              className="fw-btn fw-btn-ghost"
              onClick={back}
              disabled={step === 0}
            >
              Atrás
            </button>
            <button
              className="fw-btn fw-btn-primary"
              onClick={next}
              disabled={!currentAnswer}
            >
              {step === total - 1 ? 'Continuar' : 'Siguiente'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Estilos con tokens de marca TEA (Blue Trust, Red Speech, Dark Blue, Work Sans).
// Estado seleccionado en rojo para ser consistente con el form nativo de FunnelUp.
const CSS = `
.fw-root{--tea-blue:#283A97;--tea-red:#EA0029;--tea-dark:#0F145B;--tea-light:#4789C8;
  font-family:'Work Sans',system-ui,-apple-system,sans-serif;max-width:640px;margin:0 auto;width:100%}
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
