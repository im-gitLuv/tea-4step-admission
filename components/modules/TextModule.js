"use client";

// ─────────────────────────────────────────────────────────────
// TextModule — bloque de texto rico simple.
// Config: { title, body } — párrafos separados por línea en blanco.
// ─────────────────────────────────────────────────────────────

export default function TextModule({ module }) {
  const cfg = module?.config || {};
  const paragraphs = String(cfg.body || "").split(/\n\s*\n/).filter(Boolean);

  if (!cfg.title && paragraphs.length === 0) return null;

  return (
    <div className="mod-text">
      {cfg.title && <h3 className="video-step-title">{cfg.title}</h3>}
      {paragraphs.map((p, i) => (
        <p key={i} style={{ color: "#3c4257", fontSize: 15, lineHeight: 1.65, margin: "0 0 12px" }}>
          {p}
        </p>
      ))}
    </div>
  );
}
