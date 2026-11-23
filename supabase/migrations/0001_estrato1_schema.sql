-- ═══════════════════════════════════════════════════════════════════════
-- tea-4step-admission · ESTRATO 1
-- 0001_estrato1_schema.sql — Esquema completo de la v2 (nota 06 del vault)
--
-- Ejecutar en Supabase → SQL Editor (o `supabase db push`).
-- Idempotente donde importa; no destruye datos si se re-ejecuta.
-- Posterior a este archivo: 0002_seed_tea.sql
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════ 00. Extensiones ═══════════
-- pgcrypto solo hace falta en PostgreSQL < 13; gen_random_uuid() es nativo desde PG 13
-- (Supabase lo trae de fábrica). Si no se puede instalar, se continúa sin problema.
do $$
begin
  create extension if not exists pgcrypto;
exception when others then
  raise notice 'pgcrypto no disponible; se usa gen_random_uuid() nativo (PostgreSQL >= 13)';
end $$;

-- ═══════════ 01. Tenants (empresas) ═══════════
create table if not exists public.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                       -- "Talk English Academy"
  slug        text not null unique,                -- 'tea' → subrutas/emails
  brand       jsonb not null default '{}'::jsonb,  -- {"primary":"#EA0029","secondary":"#283A97","dark":"#0F145B","light":"#4789C8","font":"Work Sans","logo_url":"…","symbol_url":"…","app_title":"…"}
  created_at  timestamptz not null default now()
);

-- ═══════════ 02. Admins (Supabase Auth + rol por tenant) ═══════════
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  role       text not null default 'editor' check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now()
);

-- ═══════════ 03. Assets por tenant (Storage; admite URL externa CDN FunnelUp — decisión D4) ═══════════
create table if not exists public.tenant_assets (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  kind         text not null check (kind in ('logo','image','video','pdf','doc','other')),
  name         text not null,
  storage_path text not null,
  url          text not null,
  created_at   timestamptz not null default now()
);

-- ═══════════ 04. Funnels (uno o más por empresa) ═══════════
create table if not exists public.funnels (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  slug       text not null,
  title      text not null,
  status     text not null default 'published'
             check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug)
);

-- ═══════════ 05. Pasos (N pasos, orden libre) ═══════════
create table if not exists public.steps (
  id          uuid primary key default gen_random_uuid(),
  funnel_id   uuid not null references public.funnels(id) on delete cascade,
  position    int  not null,
  tab_label   text not null default '',
  short_label text not null default '',
  side_title  text not null default '',
  side_sub    text not null default '',
  headline    text not null default '',
  created_at  timestamptz not null default now(),
  unique (funnel_id, position)
);

-- ═══════════ 06. Módulos (bloques dentro de cada paso) ═══════════
create table if not exists public.modules (
  id               uuid primary key default gen_random_uuid(),
  step_id          uuid not null references public.steps(id) on delete cascade,
  position         int  not null default 0,
  type             text not null check (type in
                     ('text','video','image','form','button','download','scheduler','html')),
  config           jsonb not null default '{}'::jsonb,
  gated_by_trigger uuid,
                   -- null = visible siempre; si no, se revela al cumplirse el trigger.
                   -- La FK hacia public.triggers se añade más abajo (sección 07-B),
                   -- porque triggers se crea después y ambas se referencian en círculo.
  deleted_at       timestamptz,
  created_at       timestamptz not null default now()
);

-- ═══════════ 07. Motor de triggers ═══════════
create table if not exists public.triggers (
  id               uuid primary key default gen_random_uuid(),
  step_id          uuid not null references public.steps(id) on delete cascade,
  source_module_id uuid references public.modules(id) on delete cascade,
  event_type       text not null check (event_type in (
                     'step_entered','video_started','video_progress','video_ended',
                     'module_viewed','form_submitted','button_clicked','appointment_confirmed')),
  condition        jsonb not null default '{}'::jsonb,
  action_type      text not null check (action_type in (
                     'reveal_module','complete_step','unlock_step',
                     'send_webhook','crm_tag','crm_custom_field')),
  action_config    jsonb not null default '{}'::jsonb,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ═══════════ 07-B. FK circular modules ↔ triggers (ambas tablas ya existen) ═══════════
alter table public.modules drop constraint if exists modules_gated_by_trigger_fkey;
alter table public.modules
  add constraint modules_gated_by_trigger_fkey
  foreign key (gated_by_trigger) references public.triggers(id) on delete set null;

-- ═══════════ 08. Formularios (editor de forms) ═══════════
create table if not exists public.forms (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  title          text not null,
  description    text not null default '',
  submit_label   text not null default 'Enviar',
  consent_label  text,
  created_at     timestamptz not null default now()
);

create table if not exists public.form_questions (
  id            uuid primary key default gen_random_uuid(),
  form_id       uuid not null references public.forms(id) on delete cascade,
  position      int not null,
  type          text not null check (type in (
                  'single_choice','multi_choice','short_text','long_text',
                  'number','email','phone','consent')),
  label         text not null,
  required      boolean not null default true,
  config        jsonb not null default '{}'::jsonb,
  crm_field_key text,
  unique (form_id, position)
);

-- ═══════════ 09. Participantes (leads) ═══════════
create table if not exists public.participants (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  funnel_id      uuid references public.funnels(id) on delete set null,
  email          text not null,
  first_name     text not null default '',
  last_name      text not null default '',
  phone          text not null default '',
  source         text not null default 'magic_link'
                 check (source in ('magic_link','email_login','webhook_crm','admin_invite')),
  crm_system     text,
  crm_contact_id text,
  status         text not null default 'active' check (status in ('active','blocked')),
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz,
  unique (tenant_id, email)
);

-- ═══════════ 10. Magic links (tokens) ═══════════
create table if not exists public.access_tokens (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null references public.participants(id) on delete cascade,
  token_hash      text not null unique,
  delivery        text not null default 'email'
                  check (delivery in ('email','whatsapp','manual')),
  expires_at      timestamptz not null default now() + interval '30 days',
  used_at         timestamptz,
  revoked_at      timestamptz,
  created_by      uuid references public.admin_users(user_id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists access_tokens_participant_idx on public.access_tokens (participant_id);

-- ═══════════ 11. Progreso de pasos ═══════════
create table if not exists public.step_progress (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null references public.participants(id) on delete cascade,
  step_id         uuid not null references public.steps(id) on delete cascade,
  status          text not null default 'in_progress'
                  check (status in ('in_progress','completed')),
  entered_at      timestamptz,
  completed_at    timestamptz,
  unique (participant_id, step_id)
);

-- ═══════════ 12. Bitácora de eventos (analítica + "dónde se quedó") ═══════════
create table if not exists public.event_log (
  id              bigint generated always as identity primary key,
  participant_id  uuid not null references public.participants(id) on delete cascade,
  step_id         uuid references public.steps(id) on delete set null,
  module_id       uuid references public.modules(id) on delete set null,
  event_type      text not null,
                  -- step_entered | video_started | video_progress | video_ended
                  -- module_viewed | form_submitted | button_clicked
                  -- appointment_confirmed | session_started
  value           jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists event_log_participant_idx on public.event_log (participant_id, created_at desc);
create index if not exists event_log_type_idx on public.event_log (event_type, created_at desc);

-- ═══════════ 13. Respuestas de formularios ═══════════
create table if not exists public.form_responses (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null references public.participants(id) on delete cascade,
  form_id         uuid not null references public.forms(id) on delete cascade,
  step_id         uuid references public.steps(id) on delete set null,
  submitted_at    timestamptz not null default now()
);

create table if not exists public.form_answers (
  id          uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.form_responses(id) on delete cascade,
  question_id uuid not null references public.form_questions(id) on delete cascade,
  value       jsonb,    -- string | ["a","b"] (multi) | true/false (consent) | número
  unique (response_id, question_id)
);

-- ═══════════ 14. Citas (provider configurable) ═══════════
create table if not exists public.appointments (
  id              uuid primary key default gen_random_uuid(),
  participant_id  uuid not null references public.participants(id) on delete cascade,
  provider        text not null default 'ghl'
                  check (provider in ('ghl','calendly','native','manual')),
  external_id     text,
  calendar_id     text,
  start_time      timestamptz,
  end_time        timestamptz,
  status          text not null default 'pending'
                  check (status in ('pending','confirmed','cancelled','completed')),
  confirmed_at    timestamptz,
  updated_at      timestamptz not null default now(),
  unique (participant_id, provider, external_id)
);

-- ═══════════ 15. Integraciones CRM (opcional, por tenant) ═══════════
create table if not exists public.crm_integrations (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  provider       text not null check (provider in ('ghl','custom_webhook')),
  config         jsonb not null default '{}'::jsonb,
  field_mappings jsonb not null default '[]'::jsonb,
  tag_mapping    jsonb not null default '{}'::jsonb,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ═══════════ 16. Cola de salida (CRM no bloqueante, con reintento — Estrato 4) ═══════════
create table if not exists public.outbound_queue (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  participant_id  uuid references public.participants(id) on delete set null,
  kind            text not null,   -- 'ghl_tag' | 'ghl_custom_fields' | 'generic_webhook'
  payload         jsonb not null,
  status          text not null default 'pending'
                  check (status in ('pending','sent','failed','dead')),
  attempts        int not null default 0,
  next_retry_at   timestamptz not null default now(),
  sent_at         timestamptz,
  last_error      text,
  created_at      timestamptz not null default now()
);

-- ═══════════ 17. Bitácora de emails (magic links y recordatorios) ═══════════
create table if not exists public.email_logs (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid references public.tenants(id) on delete cascade,
  participant_id      uuid references public.participants(id) on delete set null,
  to_email            text not null,
  subject             text not null,
  kind                text not null default 'magic_link',
  provider            text not null default 'resend',
  provider_message_id text,
  status              text not null default 'sent' check (status in ('queued','sent','failed')),
  created_at          timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- SEGURIDAD — RLS en TODAS las tablas (defensa en profundidad).
-- La app habla con service_role (bypassa RLS, server-only); los admins
-- (Supabase Auth) leen y escriben su tenant via is_admin_of(); el anonimo
-- solo puede leer contenido publicado (runtime Estrato 2).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.tenants            enable row level security;
alter table public.admin_users        enable row level security;
alter table public.tenant_assets      enable row level security;
alter table public.funnels            enable row level security;
alter table public.steps              enable row level security;
alter table public.modules            enable row level security;
alter table public.triggers           enable row level security;
alter table public.forms              enable row level security;
alter table public.form_questions     enable row level security;
alter table public.participants       enable row level security;
alter table public.access_tokens      enable row level security;
alter table public.step_progress      enable row level security;
alter table public.event_log          enable row level security;
alter table public.form_responses     enable row level security;
alter table public.form_answers       enable row level security;
alter table public.appointments       enable row level security;
alter table public.crm_integrations   enable row level security;
alter table public.outbound_queue     enable row level security;
alter table public.email_logs         enable row level security;

-- Helper: ¿el admin autenticado pertenece al tenant T?
create or replace function public.is_admin_of(t uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid() and tenant_id = t
  );
$$;

-- ── tenants
drop policy if exists admin_read_tenants on public.tenants;
create policy admin_read_tenants on public.tenants
  for select to authenticated using ( public.is_admin_of(id) );
drop policy if exists admin_write_tenants on public.tenants;
create policy admin_write_tenants on public.tenants
  for all to authenticated using ( public.is_admin_of(id) ) with check ( public.is_admin_of(id) );

-- ── admin_users (un admin ve a sus compañeros de tenant)
drop policy if exists admin_read_team on public.admin_users;
create policy admin_read_team on public.admin_users
  for select to authenticated
  using ( user_id = auth.uid() or public.is_admin_of(tenant_id) );
drop policy if exists admin_write_team on public.admin_users;
create policy admin_write_team on public.admin_users
  for all to authenticated
  using ( public.is_admin_of(tenant_id) ) with check ( public.is_admin_of(tenant_id) );

-- ── tenant_assets
drop policy if exists admin_read_assets on public.tenant_assets;
create policy admin_read_assets on public.tenant_assets
  for select to authenticated using ( public.is_admin_of(tenant_id) );
drop policy if exists admin_write_assets on public.tenant_assets;
create policy admin_write_assets on public.tenant_assets
  for all to authenticated using ( public.is_admin_of(tenant_id) ) with check ( public.is_admin_of(tenant_id) );

-- ── funnels (+ lectura pública del contenido publicado)
drop policy if exists admin_read_funnels on public.funnels;
create policy admin_read_funnels on public.funnels
  for select to authenticated using ( public.is_admin_of(tenant_id) );
drop policy if exists admin_write_funnels on public.funnels;
create policy admin_write_funnels on public.funnels
  for all to authenticated using ( public.is_admin_of(tenant_id) ) with check ( public.is_admin_of(tenant_id) );
drop policy if exists public_read_published_funnels on public.funnels;
create policy public_read_published_funnels on public.funnels
  for select to anon using ( status = 'published' );

-- ── steps (+ lectura pública)
drop policy if exists admin_read_steps on public.steps;
create policy admin_read_steps on public.steps
  for select to authenticated
  using ( exists (select 1 from public.funnels f where f.id = funnel_id and public.is_admin_of(f.tenant_id)) );
drop policy if exists admin_write_steps on public.steps;
create policy admin_write_steps on public.steps
  for all to authenticated
  using ( exists (select 1 from public.funnels f where f.id = funnel_id and public.is_admin_of(f.tenant_id)) )
  with check ( exists (select 1 from public.funnels f where f.id = funnel_id and public.is_admin_of(f.tenant_id)) );
drop policy if exists public_read_steps on public.steps;
create policy public_read_steps on public.steps
  for select to anon using ( true );

-- ── modules (+ lectura pública)
drop policy if exists admin_read_modules on public.modules;
create policy admin_read_modules on public.modules
  for select to authenticated
  using ( exists (
    select 1 from public.steps s join public.funnels f on f.id = s.funnel_id
    where s.id = step_id and public.is_admin_of(f.tenant_id)) );
drop policy if exists admin_write_modules on public.modules;
create policy admin_write_modules on public.modules
  for all to authenticated
  using ( exists (
    select 1 from public.steps s join public.funnels f on f.id = s.funnel_id
    where s.id = step_id and public.is_admin_of(f.tenant_id)) )
  with check ( exists (
    select 1 from public.steps s join public.funnels f on f.id = s.funnel_id
    where s.id = step_id and public.is_admin_of(f.tenant_id)) );
drop policy if exists public_read_modules on public.modules;
create policy public_read_modules on public.modules
  for select to anon using ( true );

-- ── triggers
drop policy if exists admin_read_triggers on public.triggers;
create policy admin_read_triggers on public.triggers
  for select to authenticated
  using ( exists (
    select 1 from public.steps s join public.funnels f on f.id = s.funnel_id
    where s.id = step_id and public.is_admin_of(f.tenant_id)) );
drop policy if exists admin_write_triggers on public.triggers;
create policy admin_write_triggers on public.triggers
  for all to authenticated
  using ( exists (
    select 1 from public.steps s join public.funnels f on f.id = s.funnel_id
    where s.id = step_id and public.is_admin_of(f.tenant_id)) )
  with check ( exists (
    select 1 from public.steps s join public.funnels f on f.id = s.funnel_id
    where s.id = step_id and public.is_admin_of(f.tenant_id)) );

-- ── forms
drop policy if exists admin_read_forms on public.forms;
create policy admin_read_forms on public.forms
  for select to authenticated using ( public.is_admin_of(tenant_id) );
drop policy if exists admin_write_forms on public.forms;
create policy admin_write_forms on public.forms
  for all to authenticated using ( public.is_admin_of(tenant_id) ) with check ( public.is_admin_of(tenant_id) );

-- ── form_questions
drop policy if exists admin_read_questions on public.form_questions;
create policy admin_read_questions on public.form_questions
  for select to authenticated
  using ( exists (select 1 from public.forms fo where fo.id = form_id and public.is_admin_of(fo.tenant_id)) );
drop policy if exists admin_write_questions on public.form_questions;
create policy admin_write_questions on public.form_questions
  for all to authenticated
  using ( exists (select 1 from public.forms fo where fo.id = form_id and public.is_admin_of(fo.tenant_id)) )
  with check ( exists (select 1 from public.forms fo where fo.id = form_id and public.is_admin_of(fo.tenant_id)) );

-- ── participants
drop policy if exists admin_read_participants on public.participants;
create policy admin_read_participants on public.participants
  for select to authenticated using ( public.is_admin_of(tenant_id) );
drop policy if exists admin_write_participants on public.participants;
create policy admin_write_participants on public.participants
  for all to authenticated using ( public.is_admin_of(tenant_id) ) with check ( public.is_admin_of(tenant_id) );

-- ── access_tokens (vía participants)
drop policy if exists admin_read_tokens on public.access_tokens;
create policy admin_read_tokens on public.access_tokens
  for select to authenticated
  using ( exists (select 1 from public.participants p where p.id = participant_id and public.is_admin_of(p.tenant_id)) );
drop policy if exists admin_write_tokens on public.access_tokens;
create policy admin_write_tokens on public.access_tokens
  for all to authenticated
  using ( exists (select 1 from public.participants p where p.id = participant_id and public.is_admin_of(p.tenant_id)) )
  with check ( exists (select 1 from public.participants p where p.id = participant_id and public.is_admin_of(p.tenant_id)) );

-- ── step_progress
drop policy if exists admin_read_progress on public.step_progress;
create policy admin_read_progress on public.step_progress
  for select to authenticated
  using ( exists (select 1 from public.participants p where p.id = participant_id and public.is_admin_of(p.tenant_id)) );
drop policy if exists admin_write_progress on public.step_progress;
create policy admin_write_progress on public.step_progress
  for all to authenticated
  using ( exists (select 1 from public.participants p where p.id = participant_id and public.is_admin_of(p.tenant_id)) )
  with check ( exists (select 1 from public.participants p where p.id = participant_id and public.is_admin_of(p.tenant_id)) );

-- ── event_log
drop policy if exists admin_read_events on public.event_log;
create policy admin_read_events on public.event_log
  for select to authenticated
  using ( exists (select 1 from public.participants p where p.id = participant_id and public.is_admin_of(p.tenant_id)) );
drop policy if exists admin_write_events on public.event_log;
create policy admin_write_events on public.event_log
  for all to authenticated
  using ( exists (select 1 from public.participants p where p.id = participant_id and public.is_admin_of(p.tenant_id)) )
  with check ( exists (select 1 from public.participants p where p.id = participant_id and public.is_admin_of(p.tenant_id)) );

-- ── form_responses
drop policy if exists admin_read_responses on public.form_responses;
create policy admin_read_responses on public.form_responses
  for select to authenticated
  using ( exists (select 1 from public.participants p where p.id = participant_id and public.is_admin_of(p.tenant_id)) );
drop policy if exists admin_write_responses on public.form_responses;
create policy admin_write_responses on public.form_responses
  for all to authenticated
  using ( exists (select 1 from public.participants p where p.id = participant_id and public.is_admin_of(p.tenant_id)) )
  with check ( exists (select 1 from public.participants p where p.id = participant_id and public.is_admin_of(p.tenant_id)) );

-- ── form_answers (vía response → participant)
drop policy if exists admin_read_answers on public.form_answers;
create policy admin_read_answers on public.form_answers
  for select to authenticated
  using ( exists (
    select 1 from public.form_responses r join public.participants p on p.id = r.participant_id
    where r.id = response_id and public.is_admin_of(p.tenant_id)) );
drop policy if exists admin_write_answers on public.form_answers;
create policy admin_write_answers on public.form_answers
  for all to authenticated
  using ( exists (
    select 1 from public.form_responses r join public.participants p on p.id = r.participant_id
    where r.id = response_id and public.is_admin_of(p.tenant_id)) )
  with check ( exists (
    select 1 from public.form_responses r join public.participants p on p.id = r.participant_id
    where r.id = response_id and public.is_admin_of(p.tenant_id)) );

-- ── appointments
drop policy if exists admin_read_appointments on public.appointments;
create policy admin_read_appointments on public.appointments
  for select to authenticated
  using ( exists (select 1 from public.participants p where p.id = participant_id and public.is_admin_of(p.tenant_id)) );
drop policy if exists admin_write_appointments on public.appointments;
create policy admin_write_appointments on public.appointments
  for all to authenticated
  using ( exists (select 1 from public.participants p where p.id = participant_id and public.is_admin_of(p.tenant_id)) )
  with check ( exists (select 1 from public.participants p where p.id = participant_id and public.is_admin_of(p.tenant_id)) );

-- ── crm_integrations
drop policy if exists admin_read_integrations on public.crm_integrations;
create policy admin_read_integrations on public.crm_integrations
  for select to authenticated using ( public.is_admin_of(tenant_id) );
drop policy if exists admin_write_integrations on public.crm_integrations;
create policy admin_write_integrations on public.crm_integrations
  for all to authenticated using ( public.is_admin_of(tenant_id) ) with check ( public.is_admin_of(tenant_id) );

-- ── outbound_queue
drop policy if exists admin_read_outbound on public.outbound_queue;
create policy admin_read_outbound on public.outbound_queue
  for select to authenticated using ( public.is_admin_of(tenant_id) );
drop policy if exists admin_write_outbound on public.outbound_queue;
create policy admin_write_outbound on public.outbound_queue
  for all to authenticated using ( public.is_admin_of(tenant_id) ) with check ( public.is_admin_of(tenant_id) );

-- ── email_logs
drop policy if exists admin_read_emails on public.email_logs;
create policy admin_read_emails on public.email_logs
  for select to authenticated using ( public.is_admin_of(tenant_id) );
drop policy if exists admin_write_emails on public.email_logs;
create policy admin_write_emails on public.email_logs
  for all to authenticated using ( public.is_admin_of(tenant_id) ) with check ( public.is_admin_of(tenant_id) );
