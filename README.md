# Portal de Admisión v2 — BIG BANG (plataforma modular)

> **v2 completa en una sola pasada.** Supabase es la fuente de verdad, los magic links son
> propios (copiables a WhatsApp), el funnel es **100 % data-driven** (pasos, módulos, triggers
> y formularios se editan desde `/admin`), y el CRM (FunnelUp/GHL) pasa a ser **opcional y no
> bloqueante** vía cola con reintentos. TEA es el primer tenant; cualquier empresa puede
> tener su propio funnel sin tocar código.
>
> Todo el trabajo vive en la rama **`v2-modular`**, lista para fusionar a `main`
> (la app actual no tiene producción activa — decisión del usuario, Big Bang).

---

## 1. Qué trae esta versión (resumen)

| Capa | Qué es | Dónde |
|---|---|---|
| **Supabase** | 19 tablas + `module_states` (0003) + RLS + semilla TEA | `supabase/migrations/0001..0003` |
| **Magic links propios** | token 32B solo-sha256, 30 días, revocable, entrada `/a/<token>` | `lib/tokens.js`, `lib/invite.js`, `lib/session.js` |
| **Runtime modular** | `/portal` renderiza pasos→módulos desde Supabase; 8 tipos de módulo | `app/portal/page.js`, `components/ModuleRenderer.js`, `components/modules/*` |
| **Motor de triggers** | evento → condición → acción (reveal/complete/webhook/CRM) | `lib/triggers.js`, `app/api/event/route.js` |
| **Admin web** | dashboard, participantes+detalle, crear/copiar links, editor de funnel, integraciones | `app/admin/*`, `app/api/admin/*` |
| **Conectores** | cola `outbound_queue` (GHL/webhook) con reintentos + cron + intake | `lib/crm.js`, `app/api/cron/outbound`, `app/api/intake/lead` |
| **Compatibilidad v1** | login por email contra GHL sigue funcionando; dual-write conservado | `app/login`, `app/api/auth`, `app/api/form`, `app/api/appointment` |

**Módulos disponibles:** `video` (Plyr con seek-lock), `text`, `image`, `form`, `button`,
`download`, `scheduler`, `html`. **Triggers:** `step_entered`, `video_started`,
`video_progress` (cond. `{"pct_gte": 50}`), `video_ended`, `module_viewed`,
`form_submitted`, `button_clicked`, `appointment_confirmed` → acciones
`reveal_module`, `complete_step`, `unlock_step`, `send_webhook`, `crm_tag`, `crm_custom_field`.

---

## 2. PASO A PASO — de cero a funcionando

> **No se usan parches ni `git apply`.** Recibes el repo **completo**. Lo único que se
> conserva de tu carpeta local es `.git/` (historial) y `.env.local` (tus claves).

### Paso 1 — Preparar tu carpeta local (5 min)

```bash
cd tea-4step-admission          # tu clone local

# 1) rama de trabajo (D8: v2-modular). Si ya existe, solo haz checkout:
git checkout -b v2-modular      # o: git checkout v2-modular

# 2) GUARDA tu .env.local actual (lo vas a volver a usar):
cp .env.local ~/respaldo-env-local.txt   # o cópialo donde prefieras

# 3) Borra TODO excepto .git (el .env.local lo tienes respaldado):
ls -A | grep -v '^\.git$' | xargs rm -rf

# 4) Descomprime el paquete que descargaste (TEA-4Step-v2-bigbang.zip)
#    DENTRO de la carpeta (queda todo el contenido junto a .git):
unzip ~/Downloads/TEA-4Step-v2-bigbang.zip -d .
#    si el zip trae una carpeta interna, mueve su contenido a la raíz:
#    mv TEA-4Step-v2-bigbang/* .

# 5) Restaura tus claves y completa las nuevas:
cp ~/respaldo-env-local.txt .env.local
#    y agrega a .env.local las variables nuevas (ver Paso 4)

# 6) Instala dependencias (no cambió nada, pero por si acaso):
npm install
```

> ¿Qué se borró y qué cambió? Ver el **mapa de archivos** en la sección 3.

### Paso 2 — Ejecutar el esquema en Supabase (10 min)

Ya creaste el proyecto. Ahora en **SQL Editor → New query**, pega y ejecuta
**en este orden** (uno por query):

1. `supabase/migrations/0001_estrato1_schema.sql` → crea 19 tablas + RLS + `is_admin_of()`.
2. `supabase/migrations/0002_seed_tea.sql` → tenant TEA + funnel de 4 pasos + videos CDN +
   form con 10 preguntas + mapping GHL. **Participantes queda VACÍA — correcto.**
3. `supabase/migrations/0003_runtime_admin.sql` → `module_states` (revelado por participante)
   + índices para la cola CRM.

> Los 3 scripts son **idempotentes**: si un intento anterior quedó a medias o dio error
> (p. ej. `42P01 relation "public.triggers" does not exist` con la primera versión del bundle),
> puedes re-ejecutar el archivo completo sin duplicar datos. Las 3 migraciones fueron probadas
> de inicio a fin en PostgreSQL real (doble ejecución incluida).

Verifica en **Table Editor**: `tenants` (1 fila), `steps` (4), `modules` (6),
`triggers` (2), `forms`+`form_questions` (10), `tenant_assets` (11), `crm_integrations` (1, inactiva).

### Paso 3 — Crear el usuario admin (3 min)

1. **Authentication → Providers → Email**: déjalo habilitado y desactiva
   *Confirm email* (para poder entrar sin verificar en dev).
2. **Authentication → Users → Add user**: tu correo + una contraseña fuerte.
3. Elige UNA de estas dos formas de darlo de alta como admin:
   - **Forma automática (recomendada):** pon `ADMIN_BOOTSTRAP_EMAIL=tu@correo.com` en
     `.env.local` → con ese correo entra a `/admin/login` una vez → se auto-alta como `owner`.
   - **Forma SQL:** en SQL Editor ejecuta:
     ```sql
     insert into public.admin_users (user_id, tenant_id, role)
     select u.id, '00000000-0000-4000-8000-000000000001', 'owner'
     from auth.users u where u.email = 'TU_CORREO@ejemplo.com'
     on conflict (user_id) do nothing;
     ```

### Paso 4 — Variables de entorno (5 min)

Completa tu `.env.local` (y luego las mismas en Vercel):

```bash
# ── ya las tenías (v1) ──────────────────────────────
GHL_API_KEY=...
GHL_LOCATION_ID=9cXtL7yJiTR3U0C2xmDt

# ── Supabase (Project Settings → API) ───────────────
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# ── sesiones ────────────────────────────────────────
SESSION_SECRET=<openssl rand -base64 32>
APP_URL=http://localhost:3000

# ── email (opcional hoy; sin él los links se copian a mano) ──
RESEND_API_KEY=re_...
RESEND_FROM="TEA Admisiones <onboarding@resend.dev>"

# ── admin + conectores ──────────────────────────────
ADMIN_BOOTSTRAP_EMAIL=tu@correo.com
CRON_SECRET=<openssl rand -hex 24>
INTAKE_SECRET=
TENANT_SLUG=tea
```

> `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` **sin** `NEXT_PUBLIC_` — la clave service_role
> jamás llega al navegador. El admin también usa sesión propia en cookie httpOnly.

### Paso 5 — Arrancar y probar (15 min)

```bash
npm run dev
```

**Checklist de humo (en este orden):**

1. **Admin entra:** `http://localhost:3000/admin/login` → tu correo/contraseña → dashboard.
2. **Primer magic link desde la UI:** `/admin/participantes` → formulario "Crear acceso" con
   TU correo → *Crear link* → **Copiar link** → ábrelo en pestaña privada.
3. **Portal data-driven:** entras directo a `/portal` SIN login por email; los 4 pasos se
   ven como siempre (viene de la semilla, no del código).
4. **Motor de triggers:** Paso 3 → el formulario aparece SOLO al terminar el video
   (trigger `video_ended → reveal_module`). Paso 4 → scheduler aparece al terminar el video.
5. **Formulario:** respóndelo → en Supabase aparecen `form_responses` + `form_answers`
   y el evento `form_submitted` en `event_log`.
6. **Cita:** Paso 4 → *Confirmar cita* → `appointments` con status confirmed + tag CRM
   encolado (`outbound_queue` con kind `ghl_tag`).
7. **Persistencia:** cierra la pestaña, reabre `/portal` → estás donde quedaste (cookie 12h;
   el link sirve 30 días para re-entrar).
8. **Link inválido:** abre `/a/token-inventado` → pantalla amable.
9. **Cola CRM:** `/admin/integraciones` → *Procesar cola ahora* (si `GHL_API_KEY` está
   configurada y la integración se activó, los tags caen en el contacto).

### Paso 6 — Enviar links por email (opcional hoy)

Resend → API key → `RESEND_API_KEY`. El dominio verificado (SPF/DKIM) es para producción;
mientras tanto el sandbox `onboarding@resend.dev` solo entrega a TU correo — suficiente
para probar. Sin Resend, el flujo WhatsApp-copiable funciona igual (botón "Copiar para WhatsApp").

### Paso 7 — Desplegar a Vercel (10 min)

```bash
git add -A
git commit -m "v2 big bang: supabase + runtime modular + admin + conectores"
git push origin v2-modular
```

1. En Vercel: **Import/abre el proyecto** → la rama `v2-modular` genera un **Preview Deployment**.
2. **Settings → Environment Variables** (Preview y Production):
   todas las de `.env.local`. En `APP_URL` pon la URL pública final
   (p. ej. `https://portal.talkenglishaca.com`) — los magic links se construyen con ella.
3. **Cron:** `vercel.json` ya incluye `/api/cron/outbound` cada 5 min (reintento de la cola CRM).
4. Prueba la preview con el checklist del Paso 5.
5. **Corte a producción:** merge `v2-modular` → `main` (PR). La app ya es la v2.

### Paso 8 — Conectar FunnelUp (opcional, cuando quieras)

- **Salida (CRM recibe tags/campos):** `/admin/integraciones` → activa la integración GHL →
  los writes van por `outbound_queue` con reintentos; nada bloquea al lead.
- **Entrada (CRM pide magic links):** genera el secret en `/admin/integraciones` y en tu
  automatización de FunnelUp agrega un HTTP request:

  ```
  POST https://TU-DOMINIO/api/intake/lead
  x-intake-secret: <el secret>
  { "email": "{{lead.email}}", "first_name": "{{lead.first_name}}" }

  → { "ok": true, "magic_url": "https://.../a/<token>", "expires_at": "..." }
  ```
  y envía `magic_url` por WhatsApp/email desde la propia automatización.

---

## 3. Mapa de archivos — qué es nuevo, qué se actualizó y qué se borró

**NUEVOS (no existían):**

```
supabase/migrations/0003_runtime_admin.sql
vercel.json
lib/triggers.js            lib/crm.js           lib/funnel.js      lib/admin.js
app/api/portal/state/route.js
app/api/admin/auth/route.js         app/api/admin/overview/route.js
app/api/admin/participants/route.js app/api/admin/participants/[id]/route.js
app/api/admin/invite/route.js       app/api/admin/tokens/route.js
app/api/admin/funnel/route.js       app/api/admin/editor/route.js
app/api/admin/integrations/route.js
app/api/cron/outbound/route.js      app/api/intake/lead/route.js
components/ModuleRenderer.js
components/modules/{Video,Text,Image,Html,Button,Download,Form,Scheduler}Module.js
components/admin/AdminNav.js
app/admin/admin.css
app/admin/login/page.js   app/admin/page.js
app/admin/participantes/page.js     app/admin/participantes/[id]/page.js
app/admin/funnel/page.js            app/admin/integraciones/page.js
```

**ACTUALIZADOS (reemplazados por la versión nueva):**

```
package.json            (versión 2.0.0-bigbang)
.env.example            (añade ADMIN_BOOTSTRAP_EMAIL, CRON_SECRET, INTAKE_SECRET)
README.md               (este documento)
lib/invite.js           (createAccess acepta funnelId)
app/api/event/route.js  (bitácora + motor de triggers + PUT completar paso)
app/api/form/route.js   (v2: respuestas por question_id + triggers + cola CRM)
app/api/appointment/route.js (v2: triggers + cola CRM; GET por sesión)
components/Header.js / StepNav.js / SideProgress.js  (props data-driven, fallback v1)
```

**ELIMINADOS (reemplazados por `components/modules/*`):**

```
components/VideoStep.js      → components/modules/VideoModule.js
components/FormWizard.js     → components/modules/FormModule.js
components/ConfirmStep.js    → components/modules/SchedulerModule.js
```

**INTACTOS (no los toques):** `lib/ghl.js`, `lib/constants.js`, `lib/supabase.js`,
`lib/session.js`, `lib/tokens.js`, `lib/email.js`, `lib/progress.js`, `lib/rateLimit.js`,
`lib/ContactContext.js`, `app/api/auth/route.js`, `app/api/me/route.js`,
`app/api/step-complete/route.js`, `app/a/[token]/route.js`, `app/link-invalido/`,
`app/login/`, `scripts/admin/*`, `supabase/migrations/0001..0002`, `app/globals.css`,
`app/layout.js`, `app/page.js`, `jsconfig.json`, `next.config.js`.

---

## 4. Operación diaria del equipo

**Desde la web (recomendado):** `/admin/participantes` → Crear acceso → Copiar para WhatsApp.

**Desde la terminal (siguen funcionando):**

```bash
npm run invite  -- --email lead@correo.com --nombre Ana          # crea + email
npm run invite  -- --email lead@correo.com --no-email            # solo link (WhatsApp)
npm run revoke  -- --email lead@correo.com                       # cierra todos los links
```

**Consultas útiles (SQL Editor):**

```sql
-- ¿Dónde se quedó cada lead?
select p.email, p.first_name, max(e.created_at) as ultima_actividad
from participants p
left join event_log e on e.participant_id = p.id
group by p.id, p.email, p.first_name
order by ultima_actividad desc nulls last;

-- Última posición de video por lead
select p.email, e.value->>'pct' as pct, e.created_at
from event_log e join participants p on p.id = e.participant_id
where e.event_type = 'video_progress'
order by e.created_at desc limit 50;
```

---

## 5. Rollback y seguridad

- **Rollback de código:** `git revert` del commit, o redeploy del último commit de `main`.
- **Apagado de Supabase sin tocar código:** borra `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
  en Vercel → redeploy → la app vuelve al modo v1 puro (los magic links muestran "enlace no válido").
- **Fuga de un link:** `/admin/participantes/<id>` → Revocar (el progreso NO se borra).
- **Secrets:** `SESSION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
  `GHL_API_KEY`, `CRON_SECRET` viven SOLO en `.env.local`/Vercel — jamás en el repo.
- La clave service_role solo se usa en el servidor (API routes y scripts); el navegador
  no ve Supabase en ningún punto (ni admin ni participante).

---

## 6. Stack

Next.js 14 (App Router, JavaScript) · React 18 · @supabase/supabase-js 2 · Plyr 3.7.8 ·
Resend (REST) · Vercel (hosting + cron) · Supabase Postgres + RLS.
