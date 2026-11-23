"use client";

// ─────────────────────────────────────────────────────────────
// VideoModule — video con Plyr + seek-lock (no se puede adelantar).
// Config: { asset_url, poster_url, seek_lock, require_full_watch, title }
// Emite onProgress(pct) y onEnded() al terminar (el portal los
// convierte en eventos video_progress / video_ended).
// Plyr se importa dinámicamente porque necesita `window`.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";

export default function VideoModule({ module, stepTitle, onProgress, onEnded }) {
  const videoRef = useRef(null);
  const lastTimeRef = useRef(0);
  const completedRef = useRef(false);
  const startedRef = useRef(false);

  const cfg = module?.config || {};
  const src = cfg.asset_url || "";
  const poster = cfg.poster_url || "";
  const title = cfg.title || stepTitle || "";

  useEffect(() => {
    if (!src) return;
    let cancelled = false;

    (async () => {
      const Plyr = (await import("plyr")).default;
      if (cancelled || !videoRef.current) return;

      const controls = cfg.seek_lock === false
        ? ["play-large", "play", "progress", "current-time", "mute", "volume", "fullscreen"]
        : ["play-large", "play", "mute", "volume", "fullscreen"];

      const player = new Plyr(videoRef.current, { controls });

      // SEEK-LOCK: si intenta adelantar, lo regresamos al último tiempo visto
      if (cfg.seek_lock !== false) {
        player.on("seeking", () => {
          player.currentTime = lastTimeRef.current || 0;
        });
      }

      player.on("play", () => {
        if (!startedRef.current) {
          startedRef.current = true;
          // el 1er play dispara video_started vía onProgress al cruzar el 1er 10%
        }
      });

      player.on("timeupdate", () => {
        lastTimeRef.current = player.currentTime;
        if (player.duration > 0 && onProgress) {
          onProgress(Math.min(99, (player.currentTime / player.duration) * 100));
        }
      });

      player.on("ended", () => {
        if (completedRef.current) return;
        completedRef.current = true;
        if (onProgress) onProgress(100);
        if (onEnded) onEnded();
      });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module?.id]);

  if (!src) {
    return (
      <div className="video-box-container">
        <h3 className="video-step-title">{title || "Video"}</h3>
        <div className="disclaimer">
          Este video aún no tiene fuente configurada (edita el módulo en el admin).
        </div>
      </div>
    );
  }

  return (
    <div className="video-box-container">
      {title && <h3 className="video-step-title">{title}</h3>}
      <video ref={videoRef} playsInline controls poster={poster || undefined} preload="metadata">
        <source src={src} type="video/mp4" />
      </video>
      <div className="cta-bar">
        <span className="cta-bar-icon">🔊</span>
        <span>Sube el volumen y haz clic en reproducir</span>
        <span className="cta-bar-icon">🔊</span>
      </div>
    </div>
  );
}
