// ─────────────────────────────────────────────────────────────
// Configuración central de tea-4step-admission
// ─────────────────────────────────────────────────────────────

export const GHL_LOCATION_ID = "9cXtL7yJiTR3U0C2xmDt";

// Widget de booking para reagendar (Sales Call calendar)
export const RESCHEDULE_WIDGET_URL =
  "https://api.funnelup.io/widget/booking/DX1pbtzm6YUeytHYMjzW";

// CDN base de FunnelUp
const CDN = "https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt";

export const ASSETS = {
  logoHorizontal: `${CDN}/media/69e41954c56ad27908bfc4bc.png`,
  logoSymbol: `${CDN}/media/69e419548696a78b8dfce949.png`,
  loginVisual: `${CDN}/media/69e7afb8da11eeea68e0e7f5.png`,
};

// Videos + posters de los 4 pasos
export const STEPS = [
  {
    id: 1,
    short: "Intro",
    tabLabel: "Intro al nuevo estudiante",
    videoTitle: "Paso 1 — Bienvenida a Talk English Academy",
    sideTitle: "Bienvenida",
    sideSub: "Video introductorio",
    video: `${CDN}/media/69f3e634bb6377d896c2422f.mp4`,
    poster: `${CDN}/media/69f3eb3a22c9963731bda113.png`,
  },
  {
    id: 2,
    short: "Requisitos",
    tabLabel: "Requisitos del estudiante",
    videoTitle: "Paso 2 — Requisitos para ser estudiante de TEA",
    sideTitle: "Requisitos",
    sideSub: "Video del proceso",
    video: `${CDN}/media/69e422712c135a8c83337974.mp4`,
    poster: `${CDN}/media/69f3eb7fbb6377d896c37042.png`,
  },
  {
    id: 3,
    short: "Formulario",
    tabLabel: "Formulario de admisión",
    videoTitle: "Paso 3 — Intro al formulario de admisión",
    sideTitle: "Formulario",
    sideSub: "Cuestionario admisión",
    video: `${CDN}/media/69f3e13abb6377d896c13c7b.mp4`,
    poster: `${CDN}/media/69f3ebc2558f9094884da230.png`,
  },
  {
    id: 4,
    short: "Confirmación",
    tabLabel: "Confirma tu cita",
    videoTitle: "Paso 4 — Preparación para tu llamada de admisión",
    sideTitle: "Confirmar cita",
    sideSub: "Llamada de ventas",
    video: `${CDN}/media/69f3e13abb6377d896c13c7c.mp4`,
    poster: `${CDN}/media/69f3ec004ad535b6520629a8.png`,
  },
];

// Tags que se escriben en el contacto de GHL al completar cada paso
export const STEP_TAGS = {
  1: "paso_1_completado",
  2: "paso_2_completado",
  3: "paso_3_completado",
  4: "paso_4_completado",
};
