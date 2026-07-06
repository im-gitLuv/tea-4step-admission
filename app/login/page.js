"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useContact } from "@/lib/ContactContext";
import { ASSETS } from "@/lib/constants";

export default function LoginPage() {
  const router = useRouter();
  const { setContact, setProgress } = useContact();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (data.success) {
        setContact(data.contact);
        setProgress({ completed: [], current: 1 });
        router.push("/portal");
      } else {
        setError(data.message || "No pudimos verificar tu correo. Intenta de nuevo.");
      }
    } catch (_) {
      setError("Error de conexión. Revisa tu internet e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-form-side">
          <div className="logo-header">
            <img src={ASSETS.logoHorizontal} alt="Talk English Academy" />
          </div>

          <h2>Te damos la bienvenida al Portal de Admisión</h2>
          <p className="login-sub">
            Escribe el mismo correo que usaste al agendar tu llamada y presiona
            Ingresar.
          </p>

          <form onSubmit={handleLogin}>
            <div className="input-group">
              <label>Correo Electrónico</label>
              <input
                type="email"
                placeholder="tu@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
              />
            </div>

            <button type="submit" className="btn-login" disabled={loading}>
              {loading ? "Verificando..." : "Ingresar"}
            </button>
          </form>

          {error && <div className="login-error">{error}</div>}
        </div>

        <div
          className="login-visual-side"
          style={{ backgroundImage: `url('${ASSETS.loginVisual}')` }}
        />
      </div>
    </div>
  );
}
