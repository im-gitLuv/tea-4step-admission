# tea-4step-admission

Portal de 4 pasos de admisión de Talk English Academy. Reemplaza el HTML crudo que vivía en FunnelUp. Los leads entran con su correo (lookup en GHL API) — sin trigger links.

## Stack

Next.js (App Router) · Plyr · Vercel · GHL API (FunnelUp)

## Setup local

```bash
npm install
cp .env.example .env.local   # llenar valores reales
npm run dev                  # http://localhost:3000
```

## Env vars (local y Vercel)

| Variable | Valor |
|---|---|
| `GHL_API_KEY` | Token de API de FunnelUp/GHL |
| `GHL_LOCATION_ID` | `9cXtL7yJiTR3U0C2xmDt` |
| `RESEND_API_KEY` | (para upgrade futuro a códigos por email) |

## Estructura

```
app/
  login/page.js          Login por email (split design)
  portal/page.js         Los 4 pasos (protegido por sesión)
  api/auth/route.js      Lookup de contacto en GHL por email
  api/step-complete/     Escribe tag paso_N_completado en GHL
components/
  Header, StepNav, SideProgress, VideoStep
lib/
  constants.js           IDs, URLs de videos, tags
  ghl.js                 Helper GHL API (server-only)
  ContactContext.js      Sesión del lead (sessionStorage)
```

## Estado del build

- [x] Bloque A — Scaffold + deploy
- [x] Bloque B — Login por email
- [x] Bloque C — Portal, pasos 1-2, seek-lock, unlock secuencial, tags GHL
- [ ] Bloque D — FormWizard (11 preguntas → custom fields GHL)
- [ ] Bloque E — ConfirmStep (cita, calendarios, reagendar)
- [ ] Bloque F — QA móvil
- [ ] Bloque G — Dominio final + entrega

## Notas técnicas

- GHL API version header: `2021-07-28`
- Tags de progreso: `paso_1_completado` … `paso_4_completado` (via `POST /contacts/:id/tags`)
- Custom fields del formulario: via `PUT /contacts/:id` (patrón validado en tea-portal)
- Seek-lock: Plyr `seeking` event → revierte a `lastTime`; barra de progreso oculta por CSS
- Sesión: sessionStorage (se limpia al cerrar pestaña), sin password
