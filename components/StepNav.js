"use client";

// ─────────────────────────────────────────────────────────────
// StepNav — pestañas de pasos. v2 BIG BANG: los pasos vienen del
// estado del portal (Supabase) — puede haber 3, 4, 7 o los que el
// admin configure.
// ─────────────────────────────────────────────────────────────

export default function StepNav({ steps = [], currentStep, completed, unlocked, onGo }) {
  return (
    <div className="step-nav-wrap">
      <div className="step-nav">
        {steps.map((s, i) => {
          const isCompleted = completed.includes(s.position);
          const isActive = currentStep === s.position;
          const isLocked = !unlocked.includes(s.position);
          const cls = ["step-tab", isActive ? "active" : "", isCompleted ? "completed" : "", isLocked ? "locked" : ""]
            .filter(Boolean)
            .join(" ");

          return (
            <span key={s.id} style={{ display: "contents" }}>
              <button className={cls} onClick={() => !isLocked && onGo(s.position)} disabled={isLocked}>
                <span className="step-num">{isCompleted ? "✓" : s.position}</span>
                <span className="tab-label">
                  <span className="tab-label-full">{s.tabLabel}</span>
                  <span className="tab-label-short">{s.shortLabel || s.sideTitle}</span>
                </span>
              </button>
              {i < steps.length - 1 && <span className="step-arrow">›</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}
