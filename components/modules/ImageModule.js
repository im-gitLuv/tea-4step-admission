"use client";

// ─────────────────────────────────────────────────────────────
// ImageModule — imagen con caption opcional.
// Config: { url, alt, caption }
// ─────────────────────────────────────────────────────────────

export default function ImageModule({ module }) {
  const cfg = module?.config || {};
  if (!cfg.url) {
    return <div className="disclaimer">Imagen sin URL configurada (edítala en el admin).</div>;
  }
  return (
    <figure className="mod-image" style={{ margin: "0 0 16px", textAlign: "center" }}>
      <img
        src={cfg.url}
        alt={cfg.alt || ""}
        style={{ maxWidth: "100%", borderRadius: 12, border: "1px solid #e6e9f2" }}
      />
      {cfg.caption && (
        <figcaption style={{ color: "#8a93a6", fontSize: 13, marginTop: 8 }}>{cfg.caption}</figcaption>
      )}
    </figure>
  );
}
