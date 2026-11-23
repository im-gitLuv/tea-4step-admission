"use client";

// ─────────────────────────────────────────────────────────────
// ContactContext: guarda los datos del lead tras entrar al portal.
//
// v1: persiste en sessionStorage para sobrevivir al refresh de página
//     (se limpia al cerrar la pestaña — sesión efímera, sin password).
//
// Estrato 1 (magic links): si no hay nada en sessionStorage, pregunta
//     al servidor (GET /api/me, autenticado por la cookie del magic
//     link). Así el progreso sobrevive al cierre de la pestaña y el
//     lead que abre su link en otro dispositivo retoma donde quedó.
// ─────────────────────────────────────────────────────────────

import { createContext, useContext, useEffect, useState } from "react";

const ContactContext = createContext(null);
const STORAGE_KEY = "tea_admission_contact";
const PROGRESS_KEY = "tea_admission_progress";

export function ContactProvider({ children }) {
  const [contact, setContactState] = useState(null);
  const [progress, setProgressState] = useState({ completed: [], current: 1 });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let savedContact = null;
      let savedProgress = null;
      try {
        savedContact = sessionStorage.getItem(STORAGE_KEY);
        savedProgress = sessionStorage.getItem(PROGRESS_KEY);
        if (savedContact) setContactState(JSON.parse(savedContact));
        if (savedProgress) setProgressState(JSON.parse(savedProgress));
      } catch (_) {}

      // Estrato 1: sin contacto local → ¿hay sesión de magic link?
      if (!savedContact) {
        try {
          const res = await fetch("/api/me", { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            if (data?.success && data?.contact && !cancelled) {
              setContactState(data.contact);
              try {
                sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data.contact));
              } catch (_) {}
              if (!savedProgress && data.progress) {
                setProgressState(data.progress);
              }
            }
          }
        } catch (_) {}
      }

      if (!cancelled) setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
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
