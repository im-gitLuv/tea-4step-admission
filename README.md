# tea-4step-admission

Portal de 4 pasos de admisión de Talk English Academy. Reemplaza el HTML crudo que vivía en FunnelUp. Los leads entran con su correo (lookup en GHL API) — sin trigger links.

**Producción:** [tea-4step-admission.vercel.app](https://tea-4step-admission.vercel.app)

## Stack

Next.js (App Router) · Plyr · Vercel · GHL API (FunnelUp)

## Setup local

```bash
npm install
cp .env.example .env.local   # llenar valores reales
npm run dev                  # http://localhost:3000
```

## Env vars (local y Vercel)

| Variable          | Valor                                     |
| ----------------- | ----------------------------------------- |
| `GHL_API_KEY`     | Token de API de FunnelUp/GHL              |
| `GHL_LOCATION_ID` | `9cXtL7yJiTR3U0C2xmDt`                    |
| `RESEND_API_KEY`  | (para upgrade futuro a códigos por email) |

## Estructura

```
app/
  login/page.js             Login por email (split design)
  portal/page.js             Los 4 pasos (protegido por sesión)
  api/auth/route.js          Lookup de contacto en GHL por email
  api/step-complete/         Escribe tag paso_N_completado en GHL
  api/form/route.js          Step 3: escribe custom fields por ID + tag paso_3_completado
  api/appointment/route.js   Step 4: consulta fresca de la próxima cita (getNextAppointment)
components/
  Header, StepNav, SideProgress
  VideoStep.js                Player Plyr seek-locked + botón skip solo en dev
  FormWizard.js                Step 3: wizard de 10 preguntas + casilla de acuerdo
  ConfirmStep.js                Step 4: cita, links de calendario, confirmar, reagendar
lib/
  constants.js                IDs, URLs de videos, tags, RESCHEDULE_WIDGET_URL
  ghl.js                       Helper GHL API (server-only)
  ContactContext.js            Sesión del lead (sessionStorage)
```

## Estado del build

- [x] Bloque A — Scaffold + deploy
- [x] Bloque B — Login por email
- [x] Bloque C — Portal, pasos 1-2, seek-lock, unlock secuencial, tags GHL
- [x] Bloque D — FormWizard (10 preguntas → custom fields GHL por ID)
- [x] Bloque E — ConfirmStep (cita fresca vía GHL, calendarios, reagendar)
- [ ] Bloque F — QA móvil
- [ ] Bloque G — Dominio final + entrega

## Notas técnicas

- GHL API version header: `2021-07-28`
- Tags de progreso: `paso_1_completado` ... `paso_4_completado` (via `POST /contacts/:id/tags`)
- Custom fields del formulario (Step 3): via `PUT /contacts/:id`, escritos **por field ID, no por key** — varias keys de GHL tienen `/` o tildes (`compromiso/desicion`, `dedicacion/tiempo`, `compromiso/enfoque`, `situación_actual`) que rompen el path del API si se usan directamente
- Seek-lock: Plyr `seeking` event → revierte a `lastTime`; la barra de progreso ni siquiera se incluye en `controls` de Plyr (no está en el DOM)
- Debug: `VideoStep.js` muestra un botón "⏭ Skip video (dev)" solo cuando `NODE_ENV === "development"` — tree-shaken en el build de producción, no representa riesgo para leads reales
- Sesión: sessionStorage (se limpia al cerrar pestaña), sin password

### Step 3 — Formulario de admisión (`FormWizard.js`)

- 10 preguntas, wizard de una por pantalla, sin branching dinámico por `cal_para_quien`
- El adulto que completa el portal es siempre el estudiante (si es mayor de edad, aunque lo financien sus padres) o el padre/tutor (si el estudiante es menor) — nunca el menor directamente
- La relación patrocinador↔estudiante se captura solo en la casilla de acuerdo final, no en las preguntas individuales
- Las opciones de cada pregunta son verbatim del picklist de GHL — no se pueden reescribir sin actualizar el campo en GHL primero, o el `PUT` queda fuera de lista
- Pregunta de pago: solo `Zelle` y `Necesito explorar opciones de pago` (PayPal/Binance se removieron del picklist a propósito; el método se confirma en la llamada de admisión). El lenguaje de "descuento" se eliminó — TEA no ofrece descuentos, solo un bono de fast-action que revela Orlando en el cierre de la Sesión de Diagnóstico

### Step 4 — Confirmación de cita (`ConfirmStep.js`)

- Consulta la cita del lead con un **fetch fresco** al montar el componente (`GET /api/appointment?contactId=...`), no usa ningún dato cacheado del login — si el lead agendó después de iniciar sesión, igual se refleja
- `lib/ghl.js#getNextAppointment()` solo devuelve `startTime` (ISO string); no hay `endTime` ni `title` en la respuesta de GHL, así que el fin de la cita se calcula sumando una duración default de 45 minutos
- Tres estados: cita confirmada (con links a Google Calendar, Outlook, y descarga `.ics`), sin cita agendada (CTA para agendar en el mismo widget de reagendar), y éxito post-confirmación
- El botón "Confirmar cita" dispara `paso_4_completado` vía el mismo `/api/step-complete` que usan los pasos 1-2

## Próximos pasos

- **Bloque F:** QA en dispositivos móviles reales (iOS/Android) — validar el player de Plyr, el wizard, y los links de calendario en pantallas pequeñas
- **Bloque G:** conectar el dominio final de producción y entrega del proyecto
