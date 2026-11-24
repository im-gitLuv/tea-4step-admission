"use client";

// ─────────────────────────────────────────────────────────────
// /portal — RUNTIME MODULAR (Estrato 2 · BIG BANG).
//
// Los pasos, módulos, triggers y formularios YA NO están en el código:
// llegan del estado del portal (/api/portal/state ← Supabase) y el
// admin los edita en /admin/funnel. TEA es el primer tenant; cualquier
// empresa puede tener su propio funnel sin tocar código.
//
// Compatibilidad v1: si no hay sesión de magic link (401) el usuario
// cae al login v1, que sigue funcionando tal cual.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import StepNav from "@/components/StepNav";
import SideProgress from "@/components/SideProgress";
import ModuleRenderer from "@/components/ModuleRenderer";

// Evento al servidor: registra en event_log y devuelve efectos de triggers.
async function postEvent(payload) {
  try {
    const res = await fetch("/api/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    if (!res.ok) return { effects: [] };
    return await res.json();
  } catch (_) {
    return { effects: [] };
  }
}

async function putCompleteStep(step) {
  try {
    const res = await fetch("/api/event", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step }),
      keepalive: true,
    });
    return res.ok; // true solo si el servidor CONFIRMÓ el guardado
  } catch (_) {
    return false;
  }
}

export default function PortalPage() {
  const router = useRouter();

  const [state, setState] = useState(null); // estado del portal (server)
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [completed, setCompleted] = useState([]);
  const [revealedIds, setRevealedIds] = useState({});
  const [videoDone, setVideoDone] = useState({}); // { [moduleId]: true }
  const [videoProgress, setVideoProgress] = useState({}); // { [moduleId]: pct }
  const [saveError, setSaveError] = useState("");
  const [advancing, setAdvancing] = useState(false);
  const lastBucketRef = useRef({});
  const enteredRef = useRef({});

  // ── Cargar estado del portal ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/portal/state", { cache: "no-store" });
        if (res.status === 401 || res.status === 404) {
          router.replace("/login");
          return;
        }
        const data = await res.json();
        if (!cancelled && data?.success && data?.state) {
          const s = data.state;
          setState(s);
          setCompleted(s.progress?.completed || []);
          setCurrentStep(Math.min(s.progress?.current || 1, s.steps?.length || 1));
          const rev = {};
          (s.steps || []).forEach((st) =>
            st.modules.forEach((m) => {
              if (m.revealed) rev[m.id] = true;
            })
          );
          setRevealedIds(rev);
        }
      } catch (_) {
        router.replace("/login");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const steps = state?.steps || [];
  const step = steps.find((s) => s.position === currentStep) || null;
  const total = steps.length;

  // ── Registrar entrada a cada paso ("¿dónde se quedó?") ──
  useEffect(() => {
    if (!state || !currentStep) return;
    if (enteredRef.current[currentStep]) return;
    enteredRef.current[currentStep] = true;
    postEvent({ type: "step_entered", step: currentStep });
  }, [state, currentStep]);

  // ── Desbloqueo secuencial (igual que la v1) ──
  const unlocked = [1];
  for (let i = 2; i <= total; i++) {
    if (completed.includes(i - 1)) unlocked.push(i);
  }
  completed.forEach((id) => {
    if (!unlocked.includes(id)) unlocked.push(id);
  });

  function goStep(pos) {
    if (!unlocked.includes(pos)) return;
    setCurrentStep(pos);
  }

  // ── Aplicar efectos de triggers que llegan del servidor ──
  const applyEffects = useCallback(
    (effects) => {
      (effects || []).forEach((e) => {
        if (e.action_type === "reveal_module" && e.module_id) {
          setRevealedIds((r) => ({ ...r, [e.module_id]: true }));
        }
        if (e.action_type === "complete_step" && e.step_position) {
          completeStepLocal(e.step_position);
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [completed]
  );

  // ── Único punto de avance de paso ──
  function completeStepLocal(pos) {
    setSaveError("");
    setCompleted((prev) => {
      if (prev.includes(pos)) return prev;
      const next = [...prev, pos].sort((a, b) => a - b);
      const nextStep = Math.min(pos + 1, total);
      setCurrentStep(nextStep);
      return next;
    });
  }

  async function completeStepServer(pos) {
    if (completed.includes(pos)) return;
    setAdvancing(true);
    const ok = await putCompleteStep(pos);
    setAdvancing(false);
    // FIX: solo avanzamos la UI si el servidor confirmó el guardado.
    // Antes la UI avanzaba aunque el PUT fallara → progreso visible
    // que nunca llegaba a Supabase (incongruencia portal ↔ admin).
    if (ok) {
      completeStepLocal(pos);
    } else {
      setSaveError(
        "No pudimos guardar tu avance. Verifica tu conexión e inténtalo de nuevo — tu progreso NO se perderá."
      );
    }
  }

  // ── Callbacks de los módulos ──
  function handleVideoProgress(module, pct) {
    setVideoProgress((p) => ({ ...p, [module.id]: pct }));

    // Throttle: un evento por cada 10% recorrido (el primero = video_started)
    const bucket = Math.floor(pct / 10);
    if (lastBucketRef.current[module.id] !== bucket) {
      const prev = lastBucketRef.current[module.id];
      lastBucketRef.current[module.id] = bucket;
      const type = bucket === 1 && (prev === undefined || prev === 0) ? "video_started" : "video_progress";
      postEvent({ type, step: currentStep, moduleId: module.id, value: { pct: Math.round(pct) } });
    }
  }

  function handleVideoEnded(module) {
    setVideoDone((d) => ({ ...d, [module.id]: true }));
    setVideoProgress((p) => ({ ...p, [module.id]: 100 }));
    postEvent({ type: "video_ended", step: currentStep, moduleId: module.id, value: { pct: 100 } }).then((out) =>
      applyEffects(out?.effects)
    );
  }

  function handleButtonClick(module) {
    const action = module.config?.action || "next";
    postEvent({ type: "button_clicked", step: currentStep, moduleId: module.id, value: { action } }).then((out) =>
      applyEffects(out?.effects)
    );
    if (action === "next" || action === "complete") {
      completeStepServer(currentStep);
    }
  }

  function handleDownload(module) {
    postEvent({ type: "download_clicked", step: currentStep, moduleId: module.id });
  }

  function handleView(module) {
    postEvent({ type: "module_viewed", step: currentStep, moduleId: module.id });
  }

  function handleFormComplete() {
    // El servidor ya completó el paso (complete_on_submit) y devolvió
    // triggers; aquí solo avanzamos la UI.
    completeStepLocal(currentStep);
  }

  function handleSchedulerComplete() {
    completeStepLocal(currentStep);
  }

  // ── Botón "Continuar" por defecto (paridad v1 para pasos 1-2) ──
  // Se muestra solo si el paso NO tiene un mecanismo propio de avance
  // (button visible con next/complete, form o scheduler visibles).
  const visibleModules = (step?.modules || []).filter((m) => !m.gated || revealedIds[m.id]);
  const hasOwnAdvance = visibleModules.some(
    (m) =>
      (m.type === "button" && m.config?.action !== "url") ||
      m.type === "form" ||
      m.type === "scheduler"
  );
  const stepVideos = visibleModules.filter((m) => m.type === "video");
  const allVideosDone =
    stepVideos.length === 0 ||
    stepVideos
      .filter((m) => m.config?.require_full_watch !== false)
      .every((m) => videoDone[m.id]);

  if (loading || !state) {
    return (
      <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div className="disclaimer">Cargando tu portal…</div>
      </div>
    );
  }

  const brand = state.tenant?.brand || {};

  return (
    <div
      className="page"
      style={
        {
          "--tea-red": brand.primary || undefined,
          "--tea-blue": brand.secondary || undefined,
          "--tea-dark": brand.dark || undefined,
          "--tea-light": brand.light || undefined,
        }
      }
    >
      <Header
        contact={state.participant}
        brand={brand}
        tenantName={state.tenant?.name}
      />

      <div className="page-head">
        <div className="page-title">
          {state.funnel?.title || "Pasos"} de <span>Admisión</span> — {state.tenant?.name}
        </div>
        <div className="page-sub">
          <span style={{ fontSize: 14 }}>👉</span>
          <span>
            Completa los <strong style={{ color: "var(--tea-red)">{total} pasos</strong> antes de tu cita
            programada
          </span>
          <span style={{ fontSize: 14 }}>👈</span>
        </div>
      </div>

      <StepNav
        steps={steps}
        currentStep={currentStep}
        completed={completed}
        unlocked={unlocked}
        onGo={goStep}
      />

      <div className="content-area">
        {/* ── Panel principal ── */}
        <div>
          <div className="step-content active" key={currentStep}>
            {step && step.headline && (
              <h2 style={{ color: "var(--tea-dark)", fontSize: 20, margin: "0 0 14px" }}>{step.headline}</h2>
            )}

            {(step?.modules || []).map((m) => (
              <div key={m.id} style={{ marginBottom: 18 }}>
                <ModuleRenderer
                  module={{ ...m, revealed: Boolean(revealedIds[m.id]) }}
                  step={step}
                  callbacks={{
                    onVideoProgress: handleVideoProgress,
                    onVideoEnded: handleVideoEnded,
                    onButtonClick: handleButtonClick,
                    onDownload: handleDownload,
                    onView: handleView,
                    onFormComplete: handleFormComplete,
                    onSchedulerComplete: handleSchedulerComplete,
                  }}
                />
              </div>
            ))}

            {saveError && (
              <div className="disclaimer" style={{ color: "#b00020", fontWeight: 600 }}>
                ⚠ {saveError}
              </div>
            )}

            <div className="step-footer">
              {!hasOwnAdvance && (
                <>
                  <button
                    className="next-btn"
                    disabled={(!allVideosDone && !completed.includes(currentStep)) || advancing}
                    onClick={() => completeStepServer(currentStep)}
                  >
                    {advancing
                      ? "Guardando…"
                      : completed.includes(currentStep)
                      ? "Paso completado ✓"
                      : `Continuar al paso ${Math.min(currentStep + 1, total)} »`}
                  </button>
                  {stepVideos.some((m) => m.config?.require_full_watch !== false) && (
                    <div className="disclaimer">
                      *Este video debe ser visto en su totalidad para avanzar al siguiente paso.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <SideProgress
          steps={steps}
          currentStep={currentStep}
          completed={completed}
          unlocked={unlocked}
          videoProgress={videoProgress[stepVideos[0]?.id] || 0}
          onGo={goStep}
        />
      </div>
    </div>
  );
}
