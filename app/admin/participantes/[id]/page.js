"use client";

// ─────────────────────────────────────────────────────────────
// /admin/participantes/[id] — Ficha completa: datos, progreso,
// eventos, respuestas de formularios, citas, accesos (revocar),
// bloquear/desbloquear y crear nuevo acceso con WhatsApp copy.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AdminNav, { adminApi } from "../../../../components/admin/AdminNav";
import "../../admin.css";

export default function ParticipanteDetallePage() {
  const params = useParams();
  const id = params?.id;

  const [who, setWho] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [newLink, setNewLink] = useState(null);

  async function load() {
    try {
      const d = await adminApi(`/api/admin/participants/${id}`);
      setData(d);
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
    if (id) load();
  }, [id]);

  async function toggleBlock() {
    const next = data.participant.status === "active" ? "blocked" : "active";
    try {
      await adminApi("/api/admin/participants", {
        method: "PATCH",
        body: JSON.stringify({ id: data.participant.id, status: next }),
      });
      setMsg(`Participante ${next === "blocked" ? "bloqueado" : "desbloqueado"}.`);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function revokeToken(tokenId) {
    if (!confirm("¿Revocar este enlace? El participante perderá el acceso hasta recibir uno nuevo (el progreso NO se borra).")) return;
    try {
      await adminApi("/api/admin/tokens", {
        method: "POST",
        body: JSON.stringify({ action: "revoke", token_id: tokenId }),
      });
      setMsg("Enlace revocado.");
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function createNewAccess() {
    try {
      const d = await adminApi("/api/admin/invite", {
        method: "POST",
        body: JSON.stringify({
          email: data.participant.email,
          first_name: data.participant.first_name,
          last_name: data.participant.last_name,
          phone: data.participant.phone,
          send_email: false,
          delivery: "whatsapp",
          expires_days: 30,
        }),
      });
      setNewLink(d);
    } catch (e) {
      setError(e.message);
    }
  }

  if (!data && !error) {
    return (
      <div className="admin-root">
        <AdminNav email={who?.email} />
        <main className="admin-main">
          <p className="admin-sub">Cargando ficha…</p>
        </main>
      </div>
    );
  }

  const p = data?.participant;
  const stepLabel = {};
  (data?.steps || []).forEach((s) => (stepLabel[s.id] = `${s.position}. ${s.tab_label}`));
  const completedSteps = new Set(
    (data?.progress || []).filter((r) => r.status === "completed").map((r) => r.step_id)
  );

  return (
    <div className="admin-root">
      <AdminNav email={who?.email} />
      <main className="admin-main">
        <h1 className="admin-h1">{p?.email}</h1>
        <p className="admin-sub">
          {[p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Sin nombre"} ·{" "}
          <span className={`admin-badge ${p?.status === "active" ? "ok" : "bad"}`}>{p?.status}</span>{" "}
          <span className="admin-badge neutral">{p?.source}</span>
          {data?.funnel ? (
            <span className="admin-badge neutral">
              Funnel: {data.funnel.title}
              {data.funnel.status !== "published" ? ` (${data.funnel.status})` : ""}
            </span>
          ) : (
            <span className="admin-badge bad">Sin funnel</span>
          )}
          {p?.crm_contact_id ? <span className="admin-badge neutral">CRM: {p.crm_contact_id}</span> : null}
        </p>

        {error && <div className="admin-error">{error}</div>}
        {msg && <div className="admin-ok">{msg}</div>}

        <div className="admin-row" style={{ marginBottom: 20 }}>
          <button className="admin-btn ghost" onClick={toggleBlock}>
            {p?.status === "active" ? "Bloquear acceso" : "Desbloquear acceso"}
          </button>
          <button className="admin-btn" onClick={createNewAccess}>
            Crear nuevo acceso
          </button>
        </div>

        {newLink && (
          <div className="admin-ok">
            <div><strong>Nuevo link generado</strong> (no se envió email)</div>
            <div className="admin-mono" style={{ marginTop: 8 }}>{newLink.magic_url}</div>
            <div className="admin-row" style={{ marginTop: 10 }}>
              <button className="admin-btn small" onClick={() => navigator.clipboard.writeText(newLink.magic_url).then(() => alert("Link copiado"))}>
                Copiar link
              </button>
              <button
                className="admin-btn small"
                onClick={() => navigator.clipboard.writeText(newLink.whatsapp_block).then(() => alert("Bloque para WhatsApp copiado"))}
              >
                Copiar para WhatsApp
              </button>
            </div>
          </div>
        )}

        <div className="admin-panel">
          <h2>Progreso</h2>
          {(data?.steps || []).length === 0 ? (
            <p className="admin-sub">Sin funnel asignado.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr><th>Paso</th><th>Estado</th><th>Completado</th></tr>
              </thead>
              <tbody>
                {(data?.steps || []).map((s) => (
                  <tr key={s.id}>
                    <td>{stepLabel[s.id]}</td>
                    <td>
                      <span className={`admin-badge ${completedSteps.has(s.id) ? "ok" : "neutral"}`}>
                        {completedSteps.has(s.id) ? "completado" : "pendiente"}
                      </span>
                    </td>
                    <td>{(data?.progress || []).find((r) => r.step_id === s.id)?.completed_at
                      ? new Date((data.progress.find((r) => r.step_id === s.id)).completed_at).toLocaleString("es")
                      : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="admin-panel">
          <h2>Formularios enviados</h2>
          {(data?.responses || []).length === 0 ? (
            <p className="admin-sub">Sin respuestas.</p>
          ) : (
            (data?.responses || []).map((r) => (
              <div key={r.id} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "#5a6280", marginBottom: 6 }}>
                  {new Date(r.submitted_at).toLocaleString("es")}
                </div>
                <table className="admin-table">
                  <tbody>
                    {r.answers.map((a, i) => (
                      <tr key={i}>
                        <td style={{ width: "45%" }}>{a.label}</td>
                        <td>{String(a.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>

        <div className="admin-panel">
          <h2>Citas</h2>
          {(data?.appointments || []).length === 0 ? (
            <p className="admin-sub">Sin citas registradas.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr><th>Proveedor</th><th>Estado</th><th>Inicio</th><th>Confirmada</th></tr>
              </thead>
              <tbody>
                {(data?.appointments || []).map((a) => (
                  <tr key={a.id}>
                    <td>{a.provider}</td>
                    <td><span className={`admin-badge ${a.status === "confirmed" ? "ok" : "neutral"}`}>{a.status}</span></td>
                    <td>{a.start_time ? new Date(a.start_time).toLocaleString("es") : "—"}</td>
                    <td>{a.confirmed_at ? new Date(a.confirmed_at).toLocaleString("es") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="admin-panel">
          <h2>Accesos (magic links)</h2>
          {(data?.tokens || []).length === 0 ? (
            <p className="admin-sub">Sin tokens.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr><th>Creado</th><th>Canal</th><th>Vence</th><th>Usado</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {(data?.tokens || []).map((t) => (
                  <tr key={t.id}>
                    <td>{new Date(t.created_at).toLocaleString("es")}</td>
                    <td>{t.delivery}</td>
                    <td>{new Date(t.expires_at).toLocaleDateString("es")}</td>
                    <td>{t.used_at ? new Date(t.used_at).toLocaleString("es") : "—"}</td>
                    <td>
                      {t.revoked_at ? (
                        <span className="admin-badge bad">revocado</span>
                      ) : new Date(t.expires_at) < new Date() ? (
                        <span className="admin-badge neutral">expirado</span>
                      ) : (
                        <span className="admin-badge ok">activo</span>
                      )}
                    </td>
                    <td>
                      {!t.revoked_at && (
                        <button className="admin-btn ghost small" onClick={() => revokeToken(t.id)}>
                          Revocar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="admin-panel">
          <h2>Últimos eventos</h2>
          {(data?.events || []).length === 0 ? (
            <p className="admin-sub">Sin eventos.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr><th>Fecha</th><th>Evento</th><th>Paso</th><th>Detalle</th></tr>
              </thead>
              <tbody>
                {(data?.events || []).map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.created_at).toLocaleString("es")}</td>
                    <td>{e.event_type}</td>
                    <td>{e.step_id && stepLabel[e.step_id] ? stepLabel[e.step_id].split(".")[0] : "—"}</td>
                    <td className="admin-mono">{JSON.stringify(e.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
