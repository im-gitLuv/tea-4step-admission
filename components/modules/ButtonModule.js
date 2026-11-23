"use client";

// ─────────────────────────────────────────────────────────────
// ButtonModule — botón configurable.
// Config: { label, action: 'next'|'url'|'complete', url, target }
// El portal decide qué hace 'next' (completa el paso y avanza).
// ─────────────────────────────────────────────────────────────

export default function ButtonModule({ module, onClick }) {
  const cfg = module?.config || {};
  const label = cfg.label || "Continuar";

  if (cfg.action === "url" && cfg.url) {
    return (
      <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
        <a
          className="next-btn"
          href={cfg.url}
          target={cfg.target || "_self"}
          rel={cfg.target === "_blank" ? "noopener noreferrer" : undefined}
          style={{ display: "inline-block", textDecoration: "none" }}
        >
          {label}
        </a>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
      <button className="next-btn" type="button" onClick={() => onClick && onClick(module)}>
        {label}
      </button>
    </div>
  );
}
