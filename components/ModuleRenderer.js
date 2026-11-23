"use client";

// ─────────────────────────────────────────────────────────────
// ModuleRenderer — despachador de módulos del runtime modular.
//
// Decide qué componente renderiza cada módulo y maneja el gating:
// si el módulo tiene gated_by_trigger y aún no está revelado para
// este participante, muestra el placeholder (como la v1: el
// formulario aparece DESPUÉS del video).
// ─────────────────────────────────────────────────────────────

import VideoModule from "./modules/VideoModule";
import TextModule from "./modules/TextModule";
import ImageModule from "./modules/ImageModule";
import HtmlModule from "./modules/HtmlModule";
import ButtonModule from "./modules/ButtonModule";
import DownloadModule from "./modules/DownloadModule";
import FormModule from "./modules/FormModule";
import SchedulerModule from "./modules/SchedulerModule";

export default function ModuleRenderer({ module, step, callbacks }) {
  const hidden = module.gated && !module.revealed;

  if (hidden) {
    return (
      <div className="placeholder-box" style={{ textAlign: "center" }}>
        🔒 <strong>Sección bloqueada</strong>
        <br />
        <span style={{ color: "#8a93a6", fontSize: 14 }}>
          Esta sección se habilita al terminar el video.
        </span>
      </div>
    );
  }

  switch (module.type) {
    case "video":
      return (
        <VideoModule
          module={module}
          stepTitle={step.headline}
          onProgress={(pct) => callbacks.onVideoProgress?.(module, pct)}
          onEnded={() => callbacks.onVideoEnded?.(module)}
        />
      );
    case "text":
      return <TextModule module={module} />;
    case "image":
      return <ImageModule module={module} />;
    case "html":
      return <HtmlModule module={module} />;
    case "button":
      return (
        <ButtonModule
          module={module}
          onClick={(m) => callbacks.onButtonClick?.(m)}
        />
      );
    case "download":
      return (
        <DownloadModule
          module={module}
          onDownload={(m) => callbacks.onDownload?.(m)}
        />
      );
    case "form":
      return (
        <FormModule
          module={module}
          form={module.form}
          onComplete={() => callbacks.onFormComplete?.(module)}
        />
      );
    case "scheduler":
      return (
        <SchedulerModule
          module={module}
          onComplete={() => callbacks.onSchedulerComplete?.(module)}
        />
      );
    default:
      return null;
  }
}
