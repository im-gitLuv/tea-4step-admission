# LEEME — Estrato 1: Supabase + Magic links propios

> **⚠️ ACTUALIZACIÓN 2026-11-19 (Big Bang):** este documento queda como **registro histórico** del Estrato 1. La estrategia de estratos fue reemplazada por un **Big Bang** (la app no está en producción activa): la v2 completa (runtime modular + admin web + conectores) ya está construida sobre este cimiento. **La guía vigente es el `README.md`** de este repo y, en Obsidian, la nota `12 - Implantacion Big Bang - Paso a paso`.

> **Qué es este estrato:** el cimiento de la v2. Supabase queda instalado como la nueva fuente de verdad (participantes, progreso, eventos, respuestas) **en paralelo** a lo que ya existe: el funnel de FunnelUp sigue disparando tráfico, el login v1 sigue funcionando, GHL sigue recibiendo sus tags y custom fields. **Nada de lo que hoy usa un lead cambia.**
>
> Espec fuente: notas `06 - Modelo de datos Supabase` y `07 - Magic links propios` del vault `TEA-4Step` (Obsidian).

---

## 0. Qué trae y qué NO trae

**Trae (E1a + E1b + E1c de la nota 10):**

| Pieza | Archivos |
|---|---|
| Esquema completo v2 en Supabase (19 tablas + RLS) | `supabase/migrations/0001_estrato1_schema.sql` |
| Semilla TEA (tenant, assets CDN, funnel 4 pasos, form 10 preguntas, mapping GHL) | `supabase/migrations/0002_seed_tea.sql` |
| `module_states` (revelado por participante) + índices de la cola CRM | `supabase/migrations/0003_runtime_admin.sql` |
| Magic links: token 32B solo-hash, 30 días, revocable | `lib/tokens.js`, `lib/invite.js` |
| Entrada `/a/<token>` + cookie de sesión firmada 12h | `app/a/[token]/route.js`, `lib/session.js` |
| Email con Resend + plantilla TEA | `lib/email.js` |
| Envío de links desde terminal (con bloque copiable a WhatsApp) | `scripts/admin/send-link.mjs` |
| Revocación de links | `scripts/admin/revoke-link.mjs` |
| Identidad + progreso vía servidor: `/api/me` | `app/api/me/route.js`, `lib/progress.js` |
| Bitácora de eventos (step_entered, video_started/progress/ended…) | `app/api/event/route.js`, `app/portal/page.js` |
| Dual-write: step-complete / form / appointment escriben también en Supabase | `app/api/step-complete/route.js`, `app/api/form/route.js`, `app/api/appointment/route.js` |

**NO trae (queda para los siguientes estratos):** runtime modular de pasos (E2), vista admin web (E3), webhooks CRM entrada/salida (E4), importación de historial GHL (**no se hace** — decisión D7: arranque limpio).

**Seguridad del apagado:** si las variables de Supabase no están configuradas, todas las escrituras nuevas se convierten en no-ops y la app se comporta exactamente como la v1. Puedes desplegar este código **antes** de configurar nada.

---

## 1. Preparar el repo local (decisión D8: rama `v2-modular`)

```bash
cd tea-4step-admission
git checkout -b v2-modular        # si ya la creaste, solo git checkout v2-modular
# aplica este estrato (zip completo o git apply estrato1.patch — ver §9)
npm install                       # instala @supabase/supabase-js (única dependencia nueva)
```

---

## 2. Crear el proyecto Supabase (decisión D2: proyecto nuevo)

1. Entra a [supabase.com](https://supabase.com) → **New project**.
2. Nombre: `tea-4step-v2` (o el que prefieras). Región: la más cercana a tus leads (p. ej. `East US`). Contraseña de DB: guárdala en tu gestor.
3. Espera ~2 min a que el proyecto aprovisione.

> Este proyecto NO toca el que tengas asociado hoy a Vercel; la app hablará con este nuevo vía `service_role` desde las API routes (nunca desde el navegador).

---

## 3. Ejecutar el esquema y la semilla

En el panel de Supabase → **SQL Editor** → **New query**:

1. Pega TODO el contenido de `supabase/migrations/0001_estrato1_schema.sql` → **Run**. Resultado esperado: `Success. No rows returned` (crea 19 tablas, RLS, y la función `is_admin_of`).
2. Nueva query → pega TODO `supabase/migrations/0002_seed_tea.sql` → **Run**.
3. Nueva query → pega TODO `supabase/migrations/0003_runtime_admin.sql` → **Run** (crea `module_states` y los índices de la cola CRM).

> Los 3 scripts son **idempotentes**: si un intento anterior quedó a medias o dio error,
> re-ejecuta el archivo completo sin miedo a duplicar datos.

4. Verifica en **Table Editor**: deben existir `tenants` (fila "Talk English Academy"), `funnels`, `steps` (4 filas), `modules` (6), `triggers` (2), `forms` + `form_questions` (10), `tenant_assets` (11), `crm_integrations` (1, inactive), `module_states` (vacía). `participants` queda VACÍA — así debe ser (D7).

---

## 4. Claves y variables de entorno

Supabase → **Project Settings → API**:

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | Project URL (`https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` — **secreta, solo server**. Nunca la pongas en una variable `NEXT_PUBLIC_*` ni en código cliente. |

Genera la firma de la cookie (en tu terminal):

```bash
openssl rand -base64 32      # → SESSION_SECRET
```

Crea `.env.local` en la raíz del repo (está en `.gitignore`, no se sube):

```bash
# v1 (ya lo tenías — sigue siendo necesario mientras la v1 reciba leads)
GHL_API_KEY=...
GHL_LOCATION_ID=9cXtL7yJiTR3U0C2xmDt

# Estrato 1
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SESSION_SECRET=<salida de openssl>
APP_URL=http://localhost:3000
RESEND_API_KEY=re_...
RESEND_FROM="TEA Admisiones <onboarding@resend.dev>"
```

---

## 5. Resend: API key y remitente (decisión D3)

1. Crea cuenta en [resend.com](https://resend.com) → **API Keys** → crea una (`re_...`).
2. **Modo prueba (hoy):** usa el sandbox `RESEND_FROM="TEA Admisiones <onboarding@resend.dev>"` — solo puede enviar a **tu propio correo** registrado en Resend. Perfecto para validar el flujo completo.
3. **Producción (decisión D1):** en Resend → **Domains** → agrega el dominio que elijas (p. ej. `talkenglishaca.com`) y configura en tu DNS los registros **SPF + DKIM** que Resend te muestra. Luego: `RESEND_FROM="TEA Admisiones <admisiones@talkenglishaca.com>"` — desde ese momento el email llega a **cualquier** correo.

---

## 6. Probar todo en local

```bash
npm run dev
```

**6.1 — La v1 no cambió:** abre `http://localhost:3000` → login con un correo que exista en GHL → los 4 pasos funcionan igual que siempre (tags a GHL incluidos). Si GHL/Supabase no responden, la app no se rompe.

**6.2 — Enviar el primer magic link:**

```bash
node scripts/admin/send-link.mjs --email TU_CORREO@ejemplo.com --nombre "Prueba"
```

Salida esperada: `Participante: …` · `Enlace mágico: http://localhost:3000/a/<token>` · `Email: enviado ✔` y al final un bloque listo para pegar en WhatsApp.

**6.3 — Entrar como participante v2:** abre el enlace mágico → te redirige a `/portal` **sin escribir nada**. Verifica en Supabase:

- `participants`: tu fila con `source = admin_invite`, `last_seen_at` actualizado.
- `event_log`: `session_started`, `step_entered`, `video_started`, `video_progress` (uno por cada ~10% del video), `video_ended`.
- Completa el paso 1 → `step_progress` con `status=completed` + evento `step_completed` (+ el tag `paso_1_completado` en GHL si el participante tiene `crm_contact_id`).

**6.4 — El progreso sobrevive al cierre (criterio E1):** cierra la pestaña por completo, reabre `http://localhost:3000/portal` → el portal te reconoce por la cookie (`/api/me`) y te restaura en el paso donde ibas. La sesión de la cookie dura 12h; el link sigue sirviendo 30 días para volver a entrar.

**6.5 — WhatsApp:** en la salida del script, copia el bloque al celular → ábrelo → mismo resultado que 6.3.

**6.6 — Casos negativos:** abre `http://localhost:3000/a/token-inventado` → pantalla "Tu enlace ya no está activo" con CTA a WhatsApp.

---

## 7. Desplegar a Vercel (decisión D10: estratos, sin big-bang)

1. Sube la rama: `git add -A && git commit -m "estrato 1: supabase + magic links" && git push origin v2-modular`.
2. En Vercel → **tu proyecto** → Settings → Git: deja `main` como rama de producción; prueba este estrato con **Preview Deployments** de la rama `v2-modular` (cada push genera una URL de preview).
3. En Vercel → Settings → **Environment Variables**, agrega PARA LA RAMA `v2-modular` (Preview + Production cuando decidas el corte): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `APP_URL` (URL del preview o del dominio definitivo), `RESEND_API_KEY`, `RESEND_FROM`.
4. `APP_URL` **debe** ser la URL pública donde viven los links (los magic links se construyen con ella). En el dominio final (decisión D1 — p. ej. `portal.talkenglishaca.com`) apúntalo a Vercel y usa esa URL.
5. Verifica un link enviado desde la preview: mismo checklist de §6.

**Corte a producción (cuando tú decidas):** merge de `v2-modular` → `main`. Los leads del funnel actual siguen entrando por el login v1; el equipo empieza a entregar accesos por magic link a los nuevos. Los dos caminos viven juntos sin pisarse.

---

## 8. Operación diaria (hasta que exista la vista admin del Estrato 3)

```bash
# Dar acceso a un lead (email + copia WhatsApp)
node scripts/admin/send-link.mjs --email lead@correo.com --nombre Ana

# Solo generar el link sin email (para pegarlo donde quieras)
node scripts/admin/send-link.mjs --email lead@correo.com --no-email --delivery whatsapp

# Token con vencimiento corto
node scripts/admin/send-link.mjs --email lead@correo.com --dias 7

# Sospecha de fuga del link → cierra la puerta (no borra progreso)
node scripts/admin/revoke-link.mjs --email lead@correo.com
```

**Consultas útiles en el SQL Editor** (la vista admin del E3 las convertirá en pantallas):

```sql
-- ¿En qué paso está cada lead y cuál fue su última actividad?
select p.email, p.first_name,
       max(sp.completed_at) as ultimo_paso_completado,
       max(e.created_at)    as ultima_actividad
from participants p
left join step_progress sp on sp.participant_id = p.id
left join event_log e      on e.participant_id  = p.id
group by p.id, p.email, p.first_name
order by ultima_actividad desc nulls last;

-- ¿Dónde se quedaron? (último % de video por lead)
select p.email, e.value->>'pct' as pct_ultimo_video, e.created_at
from event_log e join participants p on p.id = e.participant_id
where e.event_type = 'video_progress'
order by e.created_at desc;
```

---

## 9. Cómo aplicar este estrato a tu repo local

**Opción A — zip completo (recomendado):** descarga `tea-4step-admission-estrato1.zip`, reemplaza tu carpeta local por su contenido (excluye `node_modules`), ejecuta `npm install`.

**Opción B — patch:** con tu repo limpio en la rama `v2-modular`:
```bash
git apply estrato1.patch
npm install
```

---

## 10. Rollback y apagado seguro

- **Sin tocar código:** borra/renombra las variables `SUPABASE_*` en Vercel → redeploy. La app vuelve a v1 pura (las escrituras Supabase se vuelven no-ops). Los magic links dejan de funcionar (mostrarán "enlace no válido") y el login v1 sigue igual.
- **Código:** `git revert` del commit del estrato o redeploy del último commit de `main` anterior.

---

## 11. Qué viene después

- **Estrato 2 — Runtime modular:** `/portal` lee pasos/módulos/triggers desde Supabase (la semilla ya reproduce el funnel actual: seek-lock, form gated al fin del video, scheduler). Editor para añadir/quitar pasos y módulos.
- **Estrato 3 — Vista admin:** login admin (Supabase Auth + `admin_users`), dashboard de participantes/progreso/respuestas, editor de formularios, botón "Crear acceso + Copiar para WhatsApp" dentro de la app.
- **Estrato 4 — Conectores:** cola `outbound_queue` hacia GHL (tags/custom fields no bloqueantes con reintento), webhook de entrada `/api/intake/lead` para que la automatización de FunnelUp entregue accesos, y webhooks salientes genéricos.
