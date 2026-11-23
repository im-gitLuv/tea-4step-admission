"use client";

// ─────────────────────────────────────────────────────────────
// DownloadModule — enlace de descarga (PDF/doc).
// Config: { label, url, filename }
// ─────────────────────────────────────────────────────────────

export default function DownloadModule({ module, onDownload }) {
  const cfg = module?.config || {};
  if (!cfg.url) {
    return <div className="disclaimer">Documento sin URL configurada (edítalo en el admin).</div>;
  }
  return (
    <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
      <a
        className="next-btn"
        href={cfg.url}
        download={cfg.filename || true}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: "inline-block", textDecoration: "none" }}
        onClick={() => onDownload && onDownload(module)}
      >
        {cfg.label || "Descargar documento"} ⬇
      </a>
    </div>
  );
}
