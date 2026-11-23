"use client";

// ─────────────────────────────────────────────────────────────
// HtmlModule — HTML libre (solo lo pega un admin desde el editor).
// Config: { html }
// ─────────────────────────────────────────────────────────────

export default function HtmlModule({ module }) {
  const cfg = module?.config || {};
  if (!cfg.html) return null;
  return <div className="mod-html" dangerouslySetInnerHTML={{ __html: cfg.html }} />;
}
