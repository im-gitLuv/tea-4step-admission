"use client";

import { ASSETS } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────
// Header — cabecera del portal. v2 BIG BANG: la marca viene del
// tenant (brand jsonb inyectado por el estado del portal), con
// fallback a los assets de la v1 para no romper el login antiguo.
// ─────────────────────────────────────────────────────────────

export default function Header({ contact, brand, tenantName }) {
  const fullName =
    [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") || "Estudiante";

  const initials =
    ((contact?.firstName?.[0] || "") + (contact?.lastName?.[0] || "")).toUpperCase() || "--";

  const symbolUrl = brand?.symbol_url || ASSETS.logoSymbol;
  const name = tenantName || brand?.app_title?.split("—")[0]?.trim() || "Talk English Academy";

  return (
    <div className="header">
      <div className="logo-area">
        <div className="logo-symbol">
          <img src={symbolUrl} alt={name} />
        </div>
        <div className="logo-text">
          {name}
          <small>PORTAL DE ADMISIÓN</small>
        </div>
      </div>
      <div className="user-pill">
        <div className="user-avatar">{initials}</div>
        <div className="user-name">{fullName}</div>
      </div>
    </div>
  );
}
