"use client";

// ─────────────────────────────────────────────────────────────
// SideProgress — panel lateral con el círculo de progreso y la
// lista de pasos. v2 BIG BANG: steps data-driven (Supabase).
// ─────────────────────────────────────────────────────────────

const CIRCUMFERENCE = 251.2; // 2πr con r=40

export default function SideProgress({
  steps = [],
  currentStep,
  completed,
  unlocked,
  videoProgress = 0, // 0-100 del video del paso actual
  onGo,
}) {
  const stepInfo = steps.find((s) => s.position === currentStep);
  const isCurrentDone = completed.includes(currentStep);
  const pct = isCurrentDone ? 100 : Math.round(videoProgress || 0);
  const dashOffset = CIRCUMFERENCE - (CIRCUMFERENCE * pct) / 100;

  return (
    <div className="side-panel">
      <div className="progress-card">
        <div className="progress-circle-wrap">
          <svg width="100" height="100" viewBox="0 0 100 100">
            <circle className="progress-circle-bg" cx="50" cy="50" r="40" />
            <circle
              className="progress-circle-fill"
              cx="50"
              cy="50"
              r="40"
              strokeDashoffset={dashOffset}
              transform="rotate(-90 50 50)"
            />
          </svg>
          <div className="progress-num">{pct}%</div>
        </div>
        <div className="progress-step-label">{stepInfo?.tabLabel}</div>
        <div className="progress-status">{isCurrentDone ? "Completado" : "En progreso"}</div>
      </div>

      <div className="steps-list">
        {steps.map((s) => {
          const isCompleted = completed.includes(s.position);
          const isActive = currentStep === s.position;
          const isLocked = !unlocked.includes(s.position);
          const cls = ["step-item", isActive ? "active" : "", isCompleted ? "completed" : "", isLocked ? "locked" : ""]
            .filter(Boolean)
            .join(" ");

          return (
            <div key={s.id} className={cls} onClick={() => !isLocked && onGo(s.position)}>
              <div className="si-num">{s.position}</div>
              <div className="si-text">
                <strong>{s.sideTitle}</strong>
                {s.sideSub}
              </div>
              <span className="si-check">{isCompleted ? "✓" : ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
