"use client";

// ─────────────────────────────────────────────────────────────
// VideoStep: video con Plyr + seek-lock (no se puede adelantar)
// Emite onProgress(pct) y onComplete() al terminar.
// Plyr se importa dinámicamente porque necesita `window`.
//
// DEBUG: botón "Skip video" visible solo en desarrollo
// (process.env.NODE_ENV === 'development'), desaparece solo en
// el build de producción — no hay riesgo de que un lead lo vea.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";

export default function VideoStep({ step, onProgress, onComplete }) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const lastTimeRef = useRef(0);
  const completedRef = useRef(false);

  useEffect(() => {
    let player;
    let cancelled = false;

    (async () => {
      const Plyr = (await import("plyr")).default;
      if (cancelled || !videoRef.current) return;

      player = new Plyr(videoRef.current, {
        controls: ["play-large", "play", "mute", "volume", "fullscreen"],
      });
      playerRef.current = player;

      // SEEK-LOCK: si intenta adelantar, lo regresamos al último tiempo visto
      player.on("seeking", () => {
        player.currentTime = lastTimeRef.current || 0;
      });

      player.on("timeupdate", () => {
        lastTimeRef.current = player.currentTime;
        if (player.duration > 0 && onProgress) {
          onProgress(
            Math.min(99, (player.currentTime / player.duration) * 100),
          );
        }
      });

      player.on("ended", () => {
        completeOnce();
      });
    })();

    return () => {
      cancelled = true;
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  // Único punto de salida del paso — lo usan tanto el evento "ended"
  // real como el botón de debug, para no duplicar la lógica de guardia.
  function completeOnce() {
    if (completedRef.current) return;
    completedRef.current = true;
    if (onProgress) onProgress(100);
    if (onComplete) onComplete();
  }

  return (
    <div className="video-box-container">
      <h3 className="video-step-title">{step.videoTitle}</h3>
      <video
        ref={videoRef}
        playsInline
        controls
        poster={step.poster}
        preload="metadata"
      >
        <source src={step.video} type="video/mp4" />
      </video>
      <div className="cta-bar">
        <span className="cta-bar-icon">🔊</span>
        <span>Sube el volumen y haz clic en reproducir</span>
        <span className="cta-bar-icon">🔊</span>
      </div>

      {process.env.NODE_ENV === "development" && (
        <button
          type="button"
          onClick={completeOnce}
          style={{
            position: "fixed",
            bottom: 16,
            right: 16,
            zIndex: 9999,
            background: "#EA0029",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 16px",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0,0,0,.3)",
          }}
        >
          ⏭ Skip video (dev)
        </button>
      )}
    </div>
  );
}
