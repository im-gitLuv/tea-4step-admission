"use client";

import { ASSETS } from "@/lib/constants";

export default function Header({ contact }) {
  const fullName = [contact?.firstName, contact?.lastName]
    .filter(Boolean)
    .join(" ") || "Estudiante";

  const initials =
    ((contact?.firstName?.[0] || "") + (contact?.lastName?.[0] || ""))
      .toUpperCase() || "--";

  return (
    <div className="header">
      <div className="logo-area">
        <div className="logo-symbol">
          <img src={ASSETS.logoSymbol} alt="TEA" />
        </div>
        <div className="logo-text">
          Talk English Academy
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
