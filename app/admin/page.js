"use client";

// ─────────────────────────────────────────────────────────────
// /admin — Dashboard: KPIs + funnel por paso + actividad reciente.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminNav, { adminApi } from "../../components/admin/AdminNav";
import "./admin.css";

export default function AdminDashboardPage() {
  const [who, setWho] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  async function loadOverview() {
    setRefreshing(true);
    try {
      const d = await adminApi("/api/admin/overview");
      setData(d);
    } catch (e) {
      if (e.message !== "No autorizado") setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const me = await adminApi("/api/admin/auth");
        setWho(me.admin);
      } catch (_) {}
      loadOverview();
    })();
  }, []);

  const k = data?.kpis || {};

  return (
    <div className="admin-root">
      <AdminNav email={who?.email} />
      <main className="admin-main">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 className="admin-h1" style={{ margin: 0 }}>
            Dashboard
          </h1>
          <button className="admin-btn ghost small" onClick={loadOverview} disabled={refreshing}>
            {refreshing ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
        <p className="admin-sub">
          {data?.funnel ? `Funnel: ${data.funnel.title}` : "Sin funnel todavía"} — vista general del tenant.
        </p>

        {error && <div className="admin-error">{error}</div>}

        {data?.problems?.length > 0 && (
          <div className="admin-error">
            <strong>
              El dashboard no pudo leer {data.problems.length} dato(s) de Supabase — los ceros pueden
              ser por esto:
            </strong>
            <ul style={{ margin: "6px 0 0 18px" }}>
              {data.problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        {!data && !error && <div className="admin-sub">Cargando…</div>}

        {data && (
          <>
            <div className="admin-cards">
              <div className="admin-card">
                <div className="kpi-num">{k.participants_total ?? 0}</div>
                <div className="kpi-label">Participantes</div>
              </div>
              <div className="admin-card">
                <div className="kpi-num">{k.participants_active_7d ?? 0}</div>
                <div className="kpi-label">Activos (7 días)</div>
              </div>
              <div className="admin-card">
                <div className="kpi-num">{k.forms_submitted ?? 0}</div>
                <div className="kpi-label">Formularios enviados</div>
              </div>
              <div className="admin-card">
                <div className="kpi-num">{k.appointments_confirmed ?? 0}</div>
                <div className="kpi-label">Citas confirmadas</div>
              </div>
              <div className={`admin-card ${k.queue_pending ? "warn" : ""}`}>
                <div className="kpi-num">{k.queue_pending ?? 0}</div>
                <div className="kpi-label">Cola CRM pendiente</div>
              </div>
              <div className={`admin-card ${k.queue_failed ? "warn" : ""}`}>
                <div className="kpi-num">{k.queue_failed ?? 0}</div>
                <div className="kpi-label">Cola CRM con error</div>
              </div>
            </div>

            <div className="admin-panel">
              <h2>Completado por paso</h2>
              {data.per_step?.length ? (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Paso</th>
                      <th>Nombre</th>
                      <th>Completado por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.per_step.map((s) => (
                      <tr key={s.position}>
                        <td>{s.position}</td>
                        <td>{s.tab_label}</td>
                        <td>
                          <strong>{s.completed}</strong>{" "}
                          <span style={{ color: "#5a6280" }}>
                            participante(s)
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="admin-sub">Aún no hay pasos en el funnel.</p>
              )}
            </div>

            <div className="admin-panel">
              <h2>Actividad reciente</h2>
              {data.recent?.length ? (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Nombre</th>
                      <th>Estado</th>
                      <th>Última actividad</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((p) => (
                      <tr key={p.id}>
                        <td>{p.email}</td>
                        <td>{[p.first_name, p.last_name].filter(Boolean).join(" ") || "—"}</td>
                        <td>
                          <span className={`admin-badge ${p.status === "active" ? "ok" : "bad"}`}>
                            {p.status}
                          </span>
                        </td>
                        <td>{p.last_seen_at ? new Date(p.last_seen_at).toLocaleString("es") : "—"}</td>
                        <td>
                          <Link className="admin-btn ghost small" href={`/admin/participantes/${p.id}`}>
                            Ver
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="admin-sub">
                  Sin participantes todavía — crea el primer acceso en{" "}
                  <Link href="/admin/participantes">Participantes</Link>.
                </p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
