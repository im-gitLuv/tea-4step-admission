"use client";

// ─────────────────────────────────────────────────────────────
// AdminNav — barra lateral del panel admin + helper de API.
// ─────────────────────────────────────────────────────────────

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

/** fetch con cookie de sesión admin; 401 → login. */
export async function adminApi(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "include",
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (res.status === 401) {
    if (typeof window !== "undefined") window.location.href = "/admin/login";
    throw new Error("No autorizado");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  return data;
}

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/participantes", label: "Participantes" },
  { href: "/admin/funnel", label: "Editor de funnel" },
  { href: "/admin/integraciones", label: "Integraciones" },
];

export default function AdminNav({ email }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    try {
      await fetch("/api/admin/auth", { method: "DELETE", credentials: "include" });
    } catch (_) {}
    router.replace("/admin/login");
  }

  return (
    <aside className="admin-sidebar">
      <div className="admin-logo">
        Portal v2 · Admin
        <small>Plataforma modular</small>
      </div>
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`admin-nav-link ${pathname === l.href ? "active" : ""}`}
        >
          {l.label}
        </Link>
      ))}
      <div className="admin-nav-footer">
        {email ? <div style={{ marginBottom: 8, wordBreak: "break-all" }}>{email}</div> : null}
        <button className="admin-logout" onClick={logout}>
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
