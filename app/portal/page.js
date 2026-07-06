"use client";

// ─────────────────────────────────────────────────────────────
// /portal — Los 4 pasos de admisión.
// Bloque C: pasos 1 y 2 completos (video + continuar + unlock).
// Pasos 3 y 4: video funcional + placeholder (Bloques D y E).
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useContact } from "@/lib/ContactContext";
import { STEPS } from "@/lib/constants";
import Header from "@/components/Header";
import StepNav from "@/components/StepNav";
import SideProgress from "@/components/SideProgress";
import VideoStep from "@/components/VideoStep";

export default function PortalPage() {
  const router = useRouter();
  const { contact, progress, setProgress, hydrated } = useContact();

  const [currentStep, setCurrentStep] = useState(1);
  const [videoDone, setVideoDone] = useState({}); // { 1: true, ... }
  const [videoProgress, setVideoProgress] = useState({}); // { 1: 45, ... }

  // Guard: sin sesión → login
  useEffect(() => {
    if (hydrated && !contact) router.replace("/login");
  }, [hydrated, contact, router]);

  // Restaurar progreso guardado (refresh de página)
  useEffect(() => {
    if (hydrated && progress) {
      setCurrentStep(progress.current || 1);
      const done = {};
      (progress.completed || []).forEach((id) => (done[id] = true));
      setVideoDone(done);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  if (!hydrated || !contact) return null;

  const completed = progress.completed || [];
  // Desbloqueados: paso 1 siempre + todo paso cuyo anterior esté completado
  const unlocked = [1];
  for (let i = 2; i <= 4; i++) {
    if (completed.includes(i - 1)) unlocked.push(i);
  }
  // Pasos ya completados también son accesibles
  completed.forEach((id) => {
    if (!unlocked.includes(id)) unlocked.push(id);
  });

  function goStep(id) {
    if (!unlocked.includes(id)) return;
    setCurrentStep(id);
    setProgress({ ...progress, current: id });
  }

  async function completeStep(id) {
    if (completed.includes(id)) return;
    const newCompleted = [...completed, id];
    const nextStep = Math.min(id + 1, 4);
    setProgress({ completed: newCompleted, current: nextStep });
    setCurrentStep(nextStep);

    // Tag en GHL (fire-and-forget: no bloquea al lead si falla)
    try {
      await fetch("/api/step-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id, step: id }),
      });
    } catch (_) {}
  }

  function handleVideoProgress(id, pct) {
    setVideoProgress((p) => ({ ...p, [id]: pct }));
  }

  function handleVideoEnded(id) {
    setVideoDone((d) => ({ ...d, [id]: true }));
    setVideoProgress((p) => ({ ...p, [id]: 100 }));
  }

  const step = STEPS.find((s) => s.id === currentStep);

  return (
    <div className="page">
      <Header contact={contact} />

      <div className="page-head">
        <div className="page-title">
          Pasos de <span>Admisión</span> — Talk English Academy
        </div>
        <div className="page-sub">
          <span style={{ fontSize: 14 }}>👉</span>
          <span>
            Completa los{" "}
            <strong style={{ color: "var(--tea-red)" }}>4 pasos</strong> antes
            de tu cita programada
          </span>
          <span style={{ fontSize: 14 }}>👈</span>
        </div>
      </div>

      <StepNav
        currentStep={currentStep}
        completed={completed}
        unlocked={unlocked}
        onGo={goStep}
      />

      <div className="content-area">
        {/* ── Panel principal ── */}
        <div>
          <div className="step-content active" key={currentStep}>
            <VideoStep
              step={step}
              onProgress={(pct) => handleVideoProgress(currentStep, pct)}
              onComplete={() => handleVideoEnded(currentStep)}
            />

            <div className="step-footer">
              {/* Pasos 1 y 2: botón continuar */}
              {(currentStep === 1 || currentStep === 2) && (
                <>
                  <button
                    className="next-btn"
                    disabled={
                      !videoDone[currentStep] &&
                      !completed.includes(currentStep)
                    }
                    onClick={() => completeStep(currentStep)}
                  >
                    {completed.includes(currentStep)
                      ? "Paso completado ✓"
                      : `Continuar al paso ${currentStep + 1} »`}
                  </button>
                  <div className="disclaimer">
                    *Este video debe ser visto en su totalidad para avanzar al
                    siguiente paso.
                  </div>
                </>
              )}

              {/* Paso 3: formulario (Bloque D) */}
              {currentStep === 3 && (
                <>
                  {!videoDone[3] && !completed.includes(3) ? (
                    <div className="disclaimer">
                      *Podrá completar el formulario después de ver el video.
                    </div>
                  ) : (
                    <div className="placeholder-box">
                      📋 <strong>Formulario de admisión</strong>
                      <br />
                      Próximamente en este espacio (Bloque D — FormWizard con
                      las 11 preguntas).
                    </div>
                  )}
                </>
              )}

              {/* Paso 4: confirmación de cita (Bloque E) */}
              {currentStep === 4 && (
                <>
                  {!videoDone[4] && !completed.includes(4) ? (
                    <div className="disclaimer">
                      *Después de ver el video podrá confirmar su cita
                      programada.
                    </div>
                  ) : (
                    <div className="placeholder-box">
                      📅 <strong>Confirmación de cita</strong>
                      <br />
                      Próximamente en este espacio (Bloque E — ConfirmStep con
                      calendario y reagendamiento).
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <SideProgress
          currentStep={currentStep}
          completed={completed}
          unlocked={unlocked}
          videoProgress={videoProgress[currentStep] || 0}
          onGo={goStep}
        />
      </div>
    </div>
  );
}
