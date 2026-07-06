"use client";

// ─────────────────────────────────────────────────────────────
// VideoStep: video con Plyr + seek-lock (no se puede adelantar)
// Emite onProgress(pct) y onComplete() al terminar.
// Plyr se importa dinámicamente porque necesita `window`.
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
          onProgress(Math.min(99, (player.currentTime / player.duration) * 100));
        }
      });

      player.on("ended", () => {
        if (completedRef.current) return;
        completedRef.current = true;
        if (onProgress) onProgress(100);
        if (onComplete) onComplete();
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
    </div>
  );
}
