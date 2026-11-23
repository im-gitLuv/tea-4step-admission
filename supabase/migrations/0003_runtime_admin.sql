-- ═══════════════════════════════════════════════════════════════════════
-- tea-4step-admission · v2 BIG BANG
-- 0003_runtime_admin.sql — soporte del runtime modular (Estrato 2)
--                        + operacion admin/conectores (Estratos 3-4)
--
-- Ejecutar DESPUES de 0001 y 0002. Idempotente: se puede re-ejecutar.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Estado de modulos por participante ──────────────────────────────
-- Un trigger con accion reveal_module inserta una fila aqui; el runtime
-- considera el modulo "revelado" cuando existe la fila (gated_by_trigger
-- marca la intencion; module_states marca el hecho por participante).
create table if not exists public.module_states (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  module_id      uuid not null references public.modules(id) on delete cascade,
  revealed_at    timestamptz not null default now(),
  unique (participant_id, module_id)
);
create index if not exists module_states_module_idx on public.module_states (module_id);

alter table public.module_states enable row level security;

drop policy if exists admin_read_module_states on public.module_states;
create policy admin_read_module_states on public.module_states
  for select to authenticated
  using ( exists (select 1 from public.participants p where p.id = participant_id and public.is_admin_of(p.tenant_id)) );
drop policy if exists admin_write_module_states on public.module_states;
create policy admin_write_module_states on public.module_states
  for all to authenticated
  using ( exists (select 1 from public.participants p where p.id = participant_id and public.is_admin_of(p.tenant_id)) )
  with check ( exists (select 1 from public.participants p where p.id = participant_id and public.is_admin_of(p.tenant_id)) );

-- ── 2. Indice para el drenaje de la cola outbound (reintentos por cron) ─
create index if not exists outbound_queue_due_idx
  on public.outbound_queue (status, next_retry_at);

-- ── 3. Indice para listar participantes por tenant en la vista admin ───
create index if not exists participants_tenant_seen_idx
  on public.participants (tenant_id, last_seen_at desc);
