-- ═══════════════════════════════════════════════════════════════════════
-- tea-4step-admission · ESTRATO 1
-- 0002_seed_tea.sql — Semilla del tenant TEA (nota 06 §9)
--
-- Idempotente: UUIDs fijos + on conflict do nothing → se puede re-ejecutar.
-- Contenido:
--   · tenant 'tea' con brand (colores/font/ logos actuales de la v1)
--   · tenant_assets con las URLs del CDN de FunnelUp (decisión D4)
--   · funnel 'admision-4-pasos' con los 4 pasos (labels verbatim v1)
--   · módulos video (seek_lock) por paso + form/scheduler gated por trigger
--   · form 'Formulario de admisión' con las 10 preguntas verbatim FormWizard
--   · crm_integrations GHL: mapping pregunta → field ID + tags (Estrato 4)
--   · participantes: NINGUNO (arranque limpio — decisión D7)
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Tenant TEA ──────────────────────────────────────────────────────
insert into public.tenants (id, name, slug, brand) values
('00000000-0000-4000-8000-000000000001',
 'Talk English Academy',
 'tea',
 '{
   "primary":   "#EA0029",
   "secondary": "#283A97",
   "dark":      "#0F145B",
   "light":     "#4789C8",
   "font":      "Work Sans",
   "logo_url":  "https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt/media/69e41954c56ad27908bfc4bc.png",
   "symbol_url":"https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt/media/69e419548696a78b8dfce949.png",
   "app_title": "Portal de Admisión — Talk English Academy"
 }'::jsonb)
on conflict (id) do nothing;

-- ── 2. Assets (URLs externas del CDN — transición gradual a Storage) ───
insert into public.tenant_assets (id, tenant_id, kind, name, storage_path, url) values
('00000000-0000-4000-8000-000000000071','00000000-0000-4000-8000-000000000001','logo', 'TEA logo horizontal',      'tea/media/69e41954c56ad27908bfc4bc.png', 'https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt/media/69e41954c56ad27908bfc4bc.png'),
('00000000-0000-4000-8000-000000000072','00000000-0000-4000-8000-000000000001','logo', 'TEA símbolo',              'tea/media/69e419548696a78b8dfce949.png', 'https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt/media/69e419548696a78b8dfce949.png'),
('00000000-0000-4000-8000-000000000073','00000000-0000-4000-8000-000000000001','image','Visual de login',          'tea/media/69e7afb8da11eeea68e0e7f5.png', 'https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt/media/69e7afb8da11eeea68e0e7f5.png'),
('00000000-0000-4000-8000-000000000074','00000000-0000-4000-8000-000000000001','video','Paso 1 — video',           'tea/media/69f3e634bb6377d896c2422f.mp4', 'https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt/media/69f3e634bb6377d896c2422f.mp4'),
('00000000-0000-4000-8000-000000000075','00000000-0000-4000-8000-000000000001','video','Paso 2 — video',           'tea/media/69e422712c135a8c83337974.mp4', 'https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt/media/69e422712c135a8c83337974.mp4'),
('00000000-0000-4000-8000-000000000076','00000000-0000-4000-8000-000000000001','video','Paso 3 — video',           'tea/media/69f3e13abb6377d896c13c7b.mp4', 'https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt/media/69f3e13abb6377d896c13c7b.mp4'),
('00000000-0000-4000-8000-000000000077','00000000-0000-4000-8000-000000000001','video','Paso 4 — video',           'tea/media/69f3e13abb6377d896c13c7c.mp4', 'https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt/media/69f3e13abb6377d896c13c7c.mp4'),
('00000000-0000-4000-8000-000000000078','00000000-0000-4000-8000-000000000001','image','Paso 1 — poster',          'tea/media/69f3eb3a22c9963731bda113.png', 'https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt/media/69f3eb3a22c9963731bda113.png'),
('00000000-0000-4000-8000-000000000079','00000000-0000-4000-8000-000000000001','image','Paso 2 — poster',          'tea/media/69f3eb7fbb6377d896c37042.png', 'https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt/media/69f3eb7fbb6377d896c37042.png'),
('00000000-0000-4000-8000-00000000007a','00000000-0000-4000-8000-000000000001','image','Paso 3 — poster',          'tea/media/69f3ebc2558f9094884da230.png', 'https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt/media/69f3ebc2558f9094884da230.png'),
('00000000-0000-4000-8000-00000000007b','00000000-0000-4000-8000-000000000001','image','Paso 4 — poster',          'tea/media/69f3ec004ad535b6520629a8.png', 'https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt/media/69f3ec004ad535b6520629a8.png')
on conflict (id) do nothing;

-- ── 3. Funnel + 4 pasos (labels verbatim de lib/constants.js) ──────────
insert into public.funnels (id, tenant_id, slug, title, status) values
('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','admision-4-pasos','Pasos de Admisión','published')
on conflict (id) do nothing;

insert into public.steps (id, funnel_id, position, tab_label, short_label, side_title, side_sub, headline) values
('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000010',1,'Intro al nuevo estudiante','Intro','Bienvenida','Video introductorio','Paso 1 — Bienvenida a Talk English Academy'),
('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000010',2,'Requisitos del estudiante','Requisitos','Requisitos','Video del proceso','Paso 2 — Requisitos para ser estudiante de TEA'),
('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000010',3,'Formulario de admisión','Formulario','Formulario','Cuestionario admisión','Paso 3 — Intro al formulario de admisión'),
('00000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000010',4,'Confirma tu cita','Confirmación','Confirmar cita','Llamada de ventas','Paso 4 — Preparación para tu llamada de admisión')
on conflict (id) do nothing;

-- ── 4. Módulos video por paso (sin gated aún; se amarra después del trigger) ──
insert into public.modules (id, step_id, position, type, config) values
('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000011',0,'video','{"asset_url":"https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt/media/69f3e634bb6377d896c2422f.mp4","poster_url":"https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt/media/69f3eb3a22c9963731bda113.png","seek_lock":true,"require_full_watch":true}'::jsonb),
('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000012',0,'video','{"asset_url":"https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt/media/69e422712c135a8c83337974.mp4","poster_url":"https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt/media/69f3eb7fbb6377d896c37042.png","seek_lock":true,"require_full_watch":true}'::jsonb),
('00000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000000013',0,'video','{"asset_url":"https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt/media/69f3e13abb6377d896c13c7b.mp4","poster_url":"https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt/media/69f3ebc2558f9094884da230.png","seek_lock":true,"require_full_watch":true}'::jsonb),
('00000000-0000-4000-8000-000000000024','00000000-0000-4000-8000-000000000014',0,'video','{"asset_url":"https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt/media/69f3e13abb6377d896c13c7c.mp4","poster_url":"https://assets.cdn.filesafe.space/9cXtL7yJiTR3U0C2xmDt/media/69f3ec004ad535b6520629a8.png","seek_lock":true,"require_full_watch":true}'::jsonb)
on conflict (id) do nothing;

-- ── 5. Triggers: fin del video revela el módulo siguiente (paso 3 y 4) ──
insert into public.triggers (id, step_id, source_module_id, event_type, condition, action_type, action_config) values
('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000023','video_ended','{}'::jsonb,'reveal_module','{"module_id":"00000000-0000-4000-8000-000000000025"}'::jsonb),
('00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000024','video_ended','{}'::jsonb,'reveal_module','{"module_id":"00000000-0000-4000-8000-000000000026"}'::jsonb)
on conflict (id) do nothing;

-- ── 6. Módulos form (paso 3) y scheduler (paso 4), gated por el trigger ──
insert into public.modules (id, step_id, position, type, config, gated_by_trigger) values
('00000000-0000-4000-8000-000000000025','00000000-0000-4000-8000-000000000013',1,'form',
 '{"form_id":"00000000-0000-4000-8000-000000000040"}'::jsonb,
 '00000000-0000-4000-8000-000000000031'),
('00000000-0000-4000-8000-000000000026','00000000-0000-4000-8000-000000000014',1,'scheduler',
 '{"provider":"ghl","calendar_id":"DX1pbtzm6YUeytHYMjzW","reschedule_widget_url":"https://api.funnelup.io/widget/booking/DX1pbtzm6YUeytHYMjzW"}'::jsonb,
 '00000000-0000-4000-8000-000000000032')
on conflict (id) do nothing;

-- ── 7. Formulario con las 10 preguntas verbatim de FormWizard.js ────────
insert into public.forms (id, tenant_id, title, description, submit_label, consent_label) values
('00000000-0000-4000-8000-000000000040',
 '00000000-0000-4000-8000-000000000001',
 'Formulario de admisión',
 '10 preguntas del Step 3 — verbatim del picklist de GHL (no cambiar sin actualizar GHL)',
 'Enviar aplicación',
 'Confirmo que mis respuestas son verdaderas y que me comprometo —por mí mismo/a o en representación del estudiante a mi cargo— a cumplir los requisitos del programa y a respaldar el pago de la matrícula en mi cita de admisión.')
on conflict (id) do nothing;

insert into public.form_questions (id, form_id, position, type, label, required, config, crm_field_key) values
('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000040',1,'single_choice','¿Cuál es tu principal motivación para dominar el inglés ahora?',true,
 '{"options":["Conseguir un ascenso o un trabajo mejor pagado","Sentirme libre y seguro en conversaciones del día a día","Poder negociar, pedir aumentos y hablar con mis jefes","Ya no quiero quedarme callado mientras otros avanzan","Quiero que mi familia vea un cambio real en mí"]}'::jsonb,'motivacion'),
('00000000-0000-4000-8000-000000000042','00000000-0000-4000-8000-000000000040',2,'single_choice','Lo que mejor describe tu situación actual es:',true,
 '{"options":["El inglés me está frenando económica y profesionalmente","Gano lo suficiente pero podría ganar mucho más con inglés","Tengo buen trabajo pero no puedo crecer sin el inglés","Quiero cambiar de trabajo pero el inglés es mi mayor barrera"]}'::jsonb,'situacion_actual'),
('00000000-0000-4000-8000-000000000043','00000000-0000-4000-8000-000000000040',3,'single_choice','¿Sientes que hablar inglés con fluidez te permitirá alcanzar esos objetivos y metas?',true,
 '{"options":["Sí, estoy convencido de eso","Creo que sí, aunque tengo dudas","No estoy seguro"]}'::jsonb,'seguridad'),
('00000000-0000-4000-8000-000000000044','00000000-0000-4000-8000-000000000040',4,'single_choice','¿Puedes dedicar un mínimo de 45 minutos al día (3 a 6 horas semanales) al programa?',true,
 '{"options":["Sí, sin problema","Tendré que ajustar mi rutina pero sí puedo","No estoy seguro"]}'::jsonb,'dedicacion_tiempo'),
('00000000-0000-4000-8000-000000000045','00000000-0000-4000-8000-000000000040',5,'single_choice','Un requisito de Talk English Academy es que debes ser serio, enseñable y estar dispuesto a practicar aunque al principio te equivoques. ¿Eso te describe?',true,
 '{"options":["Sí, eso me describe perfectamente","Creo que sí","No estoy seguro"]}'::jsonb,'seriedad'),
('00000000-0000-4000-8000-000000000046','00000000-0000-4000-8000-000000000040',6,'single_choice','¿Te comprometes a asistir a tus sesiones con total atención, sin distracciones de familia, trabajo o redes sociales?',true,
 '{"options":["Sí, me comprometo","Lo intentaré","Me será difícil"]}'::jsonb,'compromiso_enfoque'),
('00000000-0000-4000-8000-000000000047','00000000-0000-4000-8000-000000000040',7,'single_choice','¿Puedes avanzar de forma autónoma entre sesiones sin necesitar que estemos recordándote cada tarea?',true,
 '{"options":["Sí, soy autodisciplinado","Necesito cierto seguimiento pero me esfuerzo","Necesito mucho apoyo externo"]}'::jsonb,'disciplina'),
('00000000-0000-4000-8000-000000000048','00000000-0000-4000-8000-000000000040',8,'single_choice','¿Estás dispuesto a completar ejercicios entre sesiones como conversaciones en voz, grabaciones y práctica diaria?',true,
 '{"options":["Sí, entiendo que eso es parte del proceso","Depende del tipo de tarea","Prefiero solo las sesiones en vivo"]}'::jsonb,'voz'),
('00000000-0000-4000-8000-000000000049','00000000-0000-4000-8000-000000000040',9,'single_choice','¿Estás lo suficientemente comprometido con tus metas como para tomar una decisión hoy si el programa es lo que necesitas?',true,
 '{"options":["Sí, estoy listo para decidir","Necesito pensarlo un poco más"]}'::jsonb,'compromiso_decision'),
('00000000-0000-4000-8000-00000000004a','00000000-0000-4000-8000-000000000040',10,'single_choice','En tu cita, nuestro Oficial de Admisiones completará tu inscripción y te dará acceso al portal de estudiantes de Talk English Academy. Para agilizar ese proceso, indícanos cómo se cubrirá tu matrícula:',true,
 '{"options":["Zelle","Necesito explorar opciones de pago"]}'::jsonb,'tipo_de_pago')
on conflict (id) do nothing;

-- ── 8. Integración CRM GHL (inactiva en Estrato 1 — se usa en el Estrato 4;
--       aquí solo documenta el mapping pregunta → field ID real de GHL) ────
insert into public.crm_integrations (id, tenant_id, provider, config, field_mappings, tag_mapping, active) values
('00000000-0000-4000-8000-000000000060',
 '00000000-0000-4000-8000-000000000001',
 'ghl',
 '{"location_id":"9cXtL7yJiTR3U0C2xmDt","api_key_ref":"GHL_API_KEY"}'::jsonb,
 '[
   {"question_id":"00000000-0000-4000-8000-000000000041","crm_field_id":"FmdxtrfAXQhR2W8JDyXZ","crm_field_key":"motivacion"},
   {"question_id":"00000000-0000-4000-8000-000000000042","crm_field_id":"KMGZIzSLO1r5SwAY2Ntl","crm_field_key":"situacion_actual"},
   {"question_id":"00000000-0000-4000-8000-000000000043","crm_field_id":"VLcSkWWFLpRKvb2mjAID","crm_field_key":"seguridad"},
   {"question_id":"00000000-0000-4000-8000-000000000044","crm_field_id":"ZvTvkbQVliLxsMeIWtcI","crm_field_key":"dedicacion_tiempo"},
   {"question_id":"00000000-0000-4000-8000-000000000045","crm_field_id":"uyqRosmNaQqVptWhn0PB","crm_field_key":"seriedad"},
   {"question_id":"00000000-0000-4000-8000-000000000046","crm_field_id":"UPcalcyHGEbk37BuDoyS","crm_field_key":"compromiso_enfoque"},
   {"question_id":"00000000-0000-4000-8000-000000000047","crm_field_id":"LP0Pa6WIuzV2uZrdT3Rc","crm_field_key":"disciplina"},
   {"question_id":"00000000-0000-4000-8000-000000000048","crm_field_id":"CNMfPPAfXy2Sn9dZITUp","crm_field_key":"voz"},
   {"question_id":"00000000-0000-4000-8000-000000000049","crm_field_id":"iPcAqybHC06E46jhyp98","crm_field_key":"compromiso_decision"},
   {"question_id":"00000000-0000-4000-8000-00000000004a","crm_field_id":"BwZoWH4kcEuxWM8u676Y","crm_field_key":"tipo_de_pago"}
 ]'::jsonb,
 '{"step_completed_prefix":"paso_","appointment_confirmed":"salescall-confirmed"}'::jsonb,
 false)
on conflict (id) do nothing;

-- ── 9. Participantes: NINGUNO (D7 — arranque limpio) ────────────────────
-- Cada participante nace cuando el equipo le envía su magic link:
--   node scripts/admin/send-link.mjs --email lead@correo.com --nombre Ana
