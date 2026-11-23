"use client";

// ─────────────────────────────────────────────────────────────
// /admin/participantes — Lista + búsqueda + crear acceso (magic
// link con bloque copiable a WhatsApp).
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminNav, { adminApi } from "../../../components/admin/AdminNav";
import { validateEmail, normalizePhone } from "../../../lib/validation";
import "../admin.css";

export default function ParticipantesPage() {
  const [who, setWho] = useState(null);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // form de crear acceso
  const [form, setForm] = useState({ email: "", first_name: "", last_name: "", phone: "", send_email: true });
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null); // {magic_url, whatsapp_block, email_sent}

  async function load(search) {
    setLoading(true);
    try {
      const d = await adminApi(`/api/admin/participants?q=${encodeURIComponent(search || "")}&limit=100`);
      setRows(d.participants || []);
    } catch (e) {
      if (e.message !== "No autorizado") setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const me = await adminApi("/api/admin/auth");
        setWho(me.admin);
      } catch (_) {}
    })();
    load("");
  }, []);

  async function createAccess(e) {
    e.preventDefault();
    setError("");
    setCreated(null);

    // ── Validación en el cliente (la API re-valida en el servidor) ──
    const ev = validateEmail(form.email);
    if (!ev.ok) {
      setError(ev.error);
      return;
    }
    const pv = normalizePhone(form.phone);
    if (!pv.ok) {
      setError(pv.error);
      return;
    }

    setCreating(true);
    try {
      const d = await adminApi("/api/admin/invite", {
        method: "POST",
        body: JSON.stringify({ ...form, email: ev.value, phone: pv.value, delivery: "email", expires_days: 30 }),
      });
      setCreated(d);
      setForm({ email: "", first_name: "", last_name: "", phone: "", send_email: true });
      load(q);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="admin-root">
      <AdminNav email={who?.email} />
      <main className="admin-main">
        <h1 className="admin-h1">Participantes</h1>
        <p className="admin-sub">Leads con acceso al portal. Crea el magic link y cópialo a WhatsApp.</p>

        {error && <div className="admin-error">{error}</div>}

        <div className="admin-panel">
          <h2>Crear acceso</h2>
          <form onSubmit={createAccess} className="admin-row" style={{ alignItems: "flex-end" }}>
            <div style={{ flex: 2, minWidth: 220 }}>
              <label className="admin-label">Email *</label>
              <input
                className="admin-input"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="lead@correo.com"
                autoComplete="off"
              />
              <p className="admin-sub" style={{ fontSize: 11, marginTop: 4 }}>
                Se valida el formato y que el dominio pueda recibir correo.
              </p>
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <label className="admin-label">Nombre</label>
              <input className="admin-input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <label className="admin-label">Apellido</label>
              <input className="admin-input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label className="admin-label">Teléfono</label>
              <input
                className="admin-input"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+58 412 1234567"
              />
              <p className="admin-sub" style={{ fontSize: 11, marginTop: 4 }}>
                Internacional con + y código de país (opcional).
              </p>
            </div>
            <div>
              <label className="admin-label" style={{ display: "flex", gap: 6, alignItems: "center", textTransform: "none" }}>
                <input
                  type="checkbox"
                  checked={form.send_email}
                  onChange={(e) => setForm({ ...form, send_email: e.target.checked })}
                />
                Enviar email
              </label>
            </div>
            <div>
              <button className="admin-btn red" type="submit" disabled={creating}>
                {creating ? "Creando…" : "Crear link"}
              </button>
            </div>
          </form>

          {created && (
            <div className="admin-ok">
              <div>
                <strong>Link creado.</strong>{" "}
                {created.email_sent ? "Email enviado ✔" : "Email NO enviado (copia el link abajo) ✘"}
                {created.email_error ? ` — ${created.email_error}` : ""}
              </div>
              <div className="admin-mono" style={{ marginTop: 8 }}>{created.magic_url}</div>
              <div className="admin-row" style={{ marginTop: 10 }}>
                <button
                  className="admin-btn small"
                  onClick={() => navigator.clipboard.writeText(created.magic_url).then(() => alert("Link copiado"))}
                >
                  Copiar link
                </button>
                <button
                  className="admin-btn small"
                  onClick={() =>
                    navigator.clipboard.writeText(created.whatsapp_block).then(() => alert("Bloque para WhatsApp copiado"))
                  }
                >
                  Copiar para WhatsApp
                </button>
                <a className="admin-btn ghost small" href={created.magic_url} target="_blank" rel="noopener noreferrer">
                  Abrir
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="admin-panel">
          <div className="admin-row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>Listado</h2>
            <div className="admin-row">
              <input
                className="admin-input"
                style={{ width: 260 }}
                placeholder="Buscar email o nombre…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load(q)}
              />
              <button className="admin-btn ghost small" onClick={() => load(q)}>
                Buscar
              </button>
            </div>
          </div>

          {loading ? (
            <p className="admin-sub">Cargando…</p>
          ) : rows.length === 0 ? (
            <p className="admin-sub">Sin participantes aún.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Nombre</th>
                  <th>Progreso</th>
                  <th>Origen</th>
                  <th>Estado</th>
                  <th>Últ. actividad</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>{p.email}</td>
                    <td>{[p.first_name, p.last_name].filter(Boolean).join(" ") || "—"}</td>
                    <td>
                      {p.completed_positions?.length}/{p.funnel_total || "—"}{" "}
                      <span style={{ color: "#5a6280" }}>(en paso {p.current_step})</span>
                    </td>
                    <td>
                      <span className="admin-badge neutral">{p.source}</span>
                    </td>
                    <td>
                      <span className={`admin-badge ${p.status === "active" ? "ok" : "bad"}`}>{p.status}</span>
                    </td>
                    <td>{p.last_seen_at ? new Date(p.last_seen_at).toLocaleString("es") : "—"}</td>
                    <td>
                      <Link className="admin-btn ghost small" href={`/admin/participantes/${p.id}`}>
                        Ver ficha
                      </Link>
                    </td>
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
