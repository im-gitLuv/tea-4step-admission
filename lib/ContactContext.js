"use client";

// ─────────────────────────────────────────────────────────────
// ContactContext: guarda los datos del lead tras el login.
// Persiste en sessionStorage para sobrevivir refresh de página
// (se limpia al cerrar la pestaña — sesión efímera, sin password).
// ─────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useState } from "react";

const ContactContext = createContext(null);
const STORAGE_KEY = "tea_admission_contact";
const PROGRESS_KEY = "tea_admission_progress";

export function ContactProvider({ children }) {
  const [contact, setContactState] = useState(null);
  const [progress, setProgressState] = useState({ completed: [], current: 1 });
  const [hydrated, setHydrated] = useState(false);

  // Rehidratar desde sessionStorage al montar
  useEffect(() => {
    try {
      const savedContact = sessionStorage.getItem(STORAGE_KEY);
      if (savedContact) setContactState(JSON.parse(savedContact));
      const savedProgress = sessionStorage.getItem(PROGRESS_KEY);
      if (savedProgress) setProgressState(JSON.parse(savedProgress));
    } catch (_) {}
    setHydrated(true);
  }, []);

  const setContact = (data) => {
    setContactState(data);
    try {
      if (data) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  };

  const setProgress = (data) => {
    setProgressState(data);
    try {
      sessionStorage.setItem(PROGRESS_KEY, JSON.stringify(data));
    } catch (_) {}
  };

  const logout = () => {
    setContact(null);
    try {
      sessionStorage.removeItem(PROGRESS_KEY);
    } catch (_) {}
  };

  return (
    <ContactContext.Provider
      value={{ contact, setContact, progress, setProgress, logout, hydrated }}
    >
      {children}
    </ContactContext.Provider>
  );
}

export function useContact() {
  const ctx = useContext(ContactContext);
  if (!ctx) throw new Error("useContact debe usarse dentro de ContactProvider");
  return ctx;
}
