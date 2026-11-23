"use client";

// ─────────────────────────────────────────────────────────────
// /admin/integraciones — CRM (GHL), cola outbound con reintento,
// webhook de entrada para cualquier CRM, y estado de variables de
// entorno (solo indicadores de presencia, nunca valores).
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import AdminNav, { adminApi } from "../../../components/admin/AdminNav";
import "../admin.css";

export default function IntegracionesPage() {
  const [who, setWho] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [tagMappingText, setTagMappingText] = useState("");
  const [secret, setSecret] = useState("");

  async function load() {
    try {
      const d = await adminApi("/api/admin/integrations");
      setData(d);
      setTagMappingText(JSON.stringify(d.ghl?.tag_mapping || {}, null, 2));
    } catch (e) {
      if (e.message !== "No autorizado") setError(e.message);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const me = await adminApi("/api/admin/auth");
        setWho(me.admin);
      } catch (_) {}
    })();
    load();
  }, []);

  async function post(body) {
    setError("");
    setMsg("");
    try {
      const d = await adminApi("/api/admin/integrations", { method: "POST", body: JSON.stringify(body) });
      setMsg("Guardado ✓");
      if (d.result) setMsg(`Cola procesada: ${d.result.sent} enviados, ${d.result.retried} reprogramados, ${d.result.dead} muertos`);
      await load();
      setTimeout(() => setMsg(""), 2500);
    } catch (e) {
      setError(e.message);
    }
  }

  if (!data && !error) {
    return (
      <div className="admin-root">
        <AdminNav email={who?.email} />
        <main className="admin-main">
          <p className="admin-sub">Cargando…</p>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-root">
      <AdminNav email={who?.email} />
      <main className="admin-main">
        <h1 className="admin-h1">Integraciones</h1>
        <p className="admin-sub">CRM opcional, cola de salida con reintentos y webhook de entrada.</p>

        {error && <div className="admin-error">{error}</div>}
        {msg && <div className="admin-ok">{msg}</div>}

        <div className="admin-panel">
          <h2>CRM · GoHighLevel (FunnelUp)</h2>
          {data?.ghl ? (
            <>
              <div className="admin-row" style={{ marginBottom: 10 }}>
                <span className={`admin-badge ${data.ghl.active ? "ok" : "bad"}`}>
                  {data.ghl.active ? "activa" : "inactiva"}
                </span>
                <button
                  className={`admin-btn ${data.ghl.active ? "ghost" : "red"}`}
                  onClick={() => post({ action: "update_ghl", active: !data.ghl.active })}
                >
                  {data.ghl.active ? "Desactivar" : "Activar"}
                </button>
                <span className="admin-sub" style={{ margin: 0 }}>
                  GHL_API_KEY en entorno: {data.env.ghl_api_key_present ? "presente ✔" : "AUSENTE ✘"}
                </span>
              </div>

              <label className="admin-label">Mapping de tags (JSON)</label>
              <textarea className="admin-textarea" value={tagMappingText} onChange={(e) => setTagMappingText(e.target.value)} />
              <div className="admin-row" style={{ marginTop: 8 }}>
                <button
                  className="admin-btn small"
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(tagMappingText);
                      post({ action: "update_ghl", tag_mapping: parsed });
                    } catch (_) {
                      setError("El mapping de tags no es JSON válido.");
                    }
                  }}
                >
                  Guardar tags
                </button>
              </div>
              <div className="admin-sub" style={{ marginTop: 6 }}>
                Claves usadas por el sistema: <span className="admin-mono">step_completed_prefix</span>,{" "}
                <span className="admin-mono">appointment_confirmed</span>, <span className="admin-mono">form_submitted</span>
              </div>
            </>
          ) : (
            <p className="admin-sub">No hay integración GHL registrada para este tenant.</p>
          )}
        </div>

        <div className="admin-panel">
          <h2>Cola de salida (outbound_queue)</h2>
          <div className="admin-row" style={{ marginBottom: 10 }}>
            <span className="admin-badge neutral">pendientes: {data?.queue?.pending ?? 0}</span>
            <span className="admin-badge bad">con error: {data?.queue?.failed ?? 0}</span>
            <button className="admin-btn" onClick={() => post({ action: "run_queue" })}>
              Procesar cola ahora
            </button>
            <span className="admin-sub" style={{ margin: 0 }}>
              CRON_SECRET: {data?.env?.cron_secret_present ? "presente ✔" : "AUSENTE ✘"}
            </span>
          </div>
          {(data?.queue?.items || []).length > 0 && (
            <table className="admin-table">
              <thead>
                <tr><th>Creado</th><th>Tipo</th><th>Estado</th><th>Intentos</th><th>Error</th></tr>
              </thead>
              <tbody>
                {data.queue.items.map((it) => (
                  <tr key={it.id}>
                    <td>{new Date(it.created_at).toLocaleString("es")}</td>
                    <td>{it.kind}</td>
                    <td>
                      <span className={`admin-badge ${it.status === "sent" ? "ok" : it.status === "pending" ? "neutral" : "bad"}`}>
                        {it.status}
                      </span>
                    </td>
                    <td>{it.attempts}</td>
                    <td className="admin-mono">{it.last_error || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="admin-panel">
          <h2>Webhook de entrada (cualquier CRM)</h2>
          <p className="admin-sub" style={{ marginTop: 0 }}>
            Tu automatización de FunnelUp (o cualquier CRM) llama a esta URL con el email del lead y recibe el
            magic link para enviarlo por WhatsApp o email:
          </p>
          <div className="admin-mono" style={{ background: "#f7f9fe", padding: "10px 12px", borderRadius: 8 }}>
            POST https://TU-DOMINIO/api/intake/lead<br />
            Header: x-intake-secret: &lt;secret&gt;<br />
            {`Body: { "email": "lead@correo.com", "first_name": "Ana" }`}
          </div>
          <div className="admin-row" style={{ marginTop: 10, alignItems: "flex-end" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <label className="admin-label">Nuevo secret (mín. 12 caracteres)</label>
              <input className="admin-input" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="p. ej. whk_9f2c7ab1d4…" />
            </div>
            <button className="admin-btn" onClick={() => secret && post({ action: "set_intake_secret", secret })}>
              Guardar secret
            </button>
            <span className="admin-sub" style={{ margin: 0 }}>
              secret configurado: {data?.intake?.secret_configured ? "sí ✔" : "no ✘"}
            </span>
          </div>
        </div>

        <div className="admin-panel">
          <h2>Estado del entorno</h2>
          <table className="admin-table">
            <tbody>
              <tr><td>GHL_API_KEY</td><td>{data?.env?.ghl_api_key_present ? "presente ✔" : "AUSENTE ✘"}</td></tr>
              <tr><td>CRON_SECRET</td><td>{data?.env?.cron_secret_present ? "presente ✔" : "AUSENTE ✘"}</td></tr>
              <tr><td>RESEND_API_KEY</td><td>{data?.env?.resend_present ? "presente ✔" : "AUSENTE ✘"}</td></tr>
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
