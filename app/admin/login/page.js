"use client";

// ─────────────────────────────────────────────────────────────
// /admin/login — Acceso del equipo (Supabase Auth verificado en el
// servidor; el navegador nunca ve Supabase). Con ADMIN_BOOTSTRAP_EMAIL
// configurado, el primer login de ese correo se auto-alta como owner.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import { useRouter } from "next/navigation";
import "../admin.css";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No pudimos iniciar sesión.");
      }
      router.replace("/admin");
    } catch (err) {
      setError(err.message || "Error de conexión.");
      setLoading(false);
    }
  }

  return (
    <div className="admin-login-wrap">
      <div className="admin-login-card">
        <h1>Panel de administración</h1>
        <p>Acceso del equipo. Tu usuario debe existir en admin_users (o usar el email de bootstrap).</p>
        <form onSubmit={handleLogin}>
          <label className="admin-label">Correo</label>
          <input
            className="admin-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
            required
          />
          <label className="admin-label">Contraseña</label>
          <input
            className="admin-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error && <div className="admin-error">{error}</div>}
          <div style={{ marginTop: 18 }}>
            <button className="admin-btn red" type="submit" disabled={loading} style={{ width: "100%" }}>
              {loading ? "Verificando…" : "Entrar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
