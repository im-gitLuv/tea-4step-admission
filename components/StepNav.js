"use client";

import { STEPS } from "@/lib/constants";

export default function StepNav({ currentStep, completed, unlocked, onGo }) {
  return (
    <div className="step-nav-wrap">
      <div className="step-nav">
        {STEPS.map((s, i) => {
          const isCompleted = completed.includes(s.id);
          const isActive = currentStep === s.id;
          const isLocked = !unlocked.includes(s.id);
          const cls = [
            "step-tab",
            isActive ? "active" : "",
            isCompleted ? "completed" : "",
            isLocked ? "locked" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <span key={s.id} style={{ display: "contents" }}>
              <button
                className={cls}
                onClick={() => !isLocked && onGo(s.id)}
                disabled={isLocked}
              >
                <span className="step-num">{isCompleted ? "✓" : s.id}</span>
                <span className="tab-label">
                  <span className="tab-label-full">{s.tabLabel}</span>
                  <span className="tab-label-short">{s.short}</span>
                </span>
              </button>
              {i < STEPS.length - 1 && <span className="step-arrow">›</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}
