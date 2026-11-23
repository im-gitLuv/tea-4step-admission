"use client";

// ─────────────────────────────────────────────────────────────
// SchedulerModule — confirmación de cita data-driven (Estrato 2).
//
// Consulta la próxima cita con fetch fresco a /api/appointment (v2:
// sin contactId — el servidor usa la cookie; GHL si hay contacto
// enlazado, tabla appointments si no). Al confirmar:
//   POST /api/appointment { appointmentId, moduleId } → el servidor
//   confirma en GHL (si aplica), registra la cita, dispara los
//   triggers appointment_confirmed y completa el paso si el módulo
//   lo pide (complete_on_confirm ≠ false).
//
// Config: { provider, reschedule_widget_url, complete_on_confirm,
//           duration_min, title }
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

const DEFAULT_DURATION_MIN = 45;

function formatDate(date) {
  if (!date || isNaN(date)) return "";
  try {
    return new Intl.DateTimeFormat("es", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return date.toLocaleString("es");
  }
}

function toCalUTC(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function googleCalUrl(title, start, end) {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toCalUTC(start)}/${toCalUTC(end)}`,
    details: "Tu cita con el equipo de admisiones.",
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

function outlookCalUrl(title, start, end) {
  const p = new URLSearchParams({
    subject: title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    path: "/calendar/action/compose",
    rru: "addevent",
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p.toString()}`;
}

function downloadIcs(title, start, end, filenameBase) {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PortalAdmision//ES",
    "BEGIN:VEVENT",
    `UID:${Date.now()}@portal.local`,
    `DTSTAMP:${toCalUTC(new Date())}`,
    `DTSTART:${toCalUTC(start)}`,
    `DTEND:${toCalUTC(end)}`,
    `SUMMARY:${title}`,
    "DESCRIPTION:Tu cita con el equipo de admisiones.",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase || "mi-cita"}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SchedulerModule({ module, onComplete }) {
  const cfg = module?.config || {};
  const durationMin = Number(cfg.duration_min || DEFAULT_DURATION_MIN);
  const title = cfg.title || "Sesión de Diagnóstico";
  const widgetUrl = cfg.reschedule_widget_url || cfg.booking_url || "";

  const [loading, setLoading] = useState(true);
  const [appointmentId, setAppointmentId] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/appointment", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) {
          setAppointmentId(data?.id || null);
          setStartTime(data?.startTime || null);
        }
      } catch {
        if (!cancelled) {
          setAppointmentId(null);
          setStartTime(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const start = startTime ? new Date(startTime) : null;
  const hasAppt = !!start && !isNaN(start);
  const end = hasAppt ? new Date(start.getTime() + durationMin * 60000) : null;

  async function confirm() {
    setConfirming(true);
    setError("");
    try {
      const res = await fetch("/api/appointment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId, moduleId: module.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "No pudimos confirmar tu cita.");
      }
      setConfirmed(true);
      if (typeof onComplete === "function") onComplete();
    } catch (e) {
      setError(e.message || "Ocurrió un error. Intenta de nuevo.");
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="cs-root">
        <style>{CSS}</style>
        <div className="cs-card">
          <p className="cs-sub">Buscando tu cita…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cs-root">
      <style>{CSS}</style>

      {confirmed ? (
        <div className="cs-card cs-success">
          <div className="cs-check">✓</div>
          <h3 className="cs-title">¡Todo listo!</h3>
          <p className="cs-sub">
            Tu cita quedó confirmada. Te esperamos — llega puntual y con buena conexión.
            Ya puedes cerrar esta página. ¡Y no olvides añadir tu cita a tu calendario!
          </p>
          {hasAppt && <p className="cs-date">{formatDate(start)}</p>}
        </div>
      ) : hasAppt ? (
        <div className="cs-card">
          <h3 className="cs-title">Confirma tu cita</h3>
          <div className="cs-appt">
            <span className="cs-appt-label">{title}</span>
            <span className="cs-date">{formatDate(start)}</span>
          </div>

          <div className="cs-calrow">
            <a className="cs-cal" href={googleCalUrl(title, start, end)} target="_blank" rel="noopener noreferrer">
              Google Calendar
            </a>
            <a className="cs-cal" href={outlookCalUrl(title, start, end)} target="_blank" rel="noopener noreferrer">
              Outlook
            </a>
            <button className="cs-cal" type="button" onClick={() => downloadIcs(title, start, end)}>
              Descargar .ics
            </button>
          </div>

          {error && <div className="cs-error">{error}</div>}

          <button className="cs-btn cs-btn-primary" onClick={confirm} disabled={confirming}>
            {confirming ? "Confirmando…" : "Confirmar cita"}
          </button>

          {widgetUrl && (
            <a className="cs-reschedule" href={widgetUrl} target="_blank" rel="noopener noreferrer">
              ¿Necesitas otro horario? Reagendar
            </a>
          )}
        </div>
      ) : (
        <div className="cs-card">
          <h3 className="cs-title">No hay fecha agendada aún</h3>
          <p className="cs-sub">Agenda tu cita para completar tu admisión — es el último paso.</p>
          {error && <div className="cs-error">{error}</div>}
          {widgetUrl && (
            <a className="cs-btn cs-btn-primary cs-btn-link" href={widgetUrl} target="_blank" rel="noopener noreferrer">
              Agendar mi cita
            </a>
          )}
        </div>
      )}
    </div>
  );
}

const CSS = `
.cs-root{font-family:'Work Sans',system-ui,-apple-system,sans-serif;max-width:640px;margin:0 auto;width:100%}
.cs-card{background:#fff;border:1px solid #ebebeb;border-radius:14px;padding:24px 20px;box-shadow:0 1px 5px rgba(87,100,126,.10);text-align:center}
.cs-title{color:var(--tea-dark);font-size:20px;font-weight:700;margin:0 0 6px}
.cs-sub{color:#4a5170;font-size:14px;line-height:1.5;margin:0 0 18px}
.cs-appt{display:flex;flex-direction:column;gap:6px;background:#f7f9fe;border:1px solid #e0e6f5;border-radius:10px;padding:16px;margin-bottom:16px}
.cs-appt-label{color:var(--tea-blue);font-size:13px;font-weight:700;letter-spacing:.03em;text-transform:uppercase}
.cs-date{color:var(--tea-dark);font-size:16px;font-weight:600;text-transform:capitalize}
.cs-calrow{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:18px}
.cs-cal{font-family:inherit;font-size:13px;font-weight:600;color:var(--tea-blue);background:#fff;border:1.5px solid #d3d9ea;border-radius:8px;padding:9px 14px;cursor:pointer;text-decoration:none;transition:all .15s}
.cs-cal:hover{background:#eef1fb;border-color:var(--tea-blue)}
.cs-btn{font-family:inherit;font-size:15px;font-weight:700;border-radius:8px;padding:14px 22px;cursor:pointer;border:none;width:100%;transition:background .15s,opacity .15s}
.cs-btn:disabled{opacity:.5;cursor:not-allowed}
.cs-btn-primary{background:var(--tea-red);color:#fff;text-transform:uppercase;letter-spacing:.05em}
.cs-btn-primary:not(:disabled):hover{background:var(--tea-dark)}
.cs-btn-link{display:block;text-decoration:none;text-align:center;box-sizing:border-box}
.cs-reschedule{display:inline-block;margin-top:14px;color:var(--tea-blue);font-size:13.5px;font-weight:600;text-decoration:underline;cursor:pointer;background:none;border:none;font-family:inherit}
.cs-reschedule:hover{color:var(--tea-red)}
.cs-error{color:var(--tea-red);font-size:13px;font-weight:500;margin-bottom:12px}
.cs-success{border-color:#cfead6}
.cs-check{width:52px;height:52px;margin:0 auto 12px;border-radius:50%;background:#e7f6ec;color:#1f9d54;font-size:26px;font-weight:700;display:flex;align-items:center;justify-content:center}
@media(max-width:480px){.cs-card{padding:20px 14px}}
`;
