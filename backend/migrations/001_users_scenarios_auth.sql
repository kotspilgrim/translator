-- ============================================================================
-- Users, scenarios ownership, scenario pins, and per-user translation history.
-- Run in the Supabase SQL editor (or `supabase db push` if you adopt the CLI).
--
-- Assumes `translations` ALREADY EXISTS (created by hand in Supabase earlier,
-- written to by backend/server.js) with at least:
--   id uuid pk default gen_random_uuid(), created_at timestamptz default now(),
--   original_text text, translated_text text, from_lang text, to_lang text,
--   scenario text
-- This script only ADDS columns to it — it never CREATEs or DROPs it.
--
-- gen_random_uuid() is built into Postgres 13+ (which Supabase runs), no
-- extension needed.
--
-- Not covered here (separate work, out of scope for this migration):
--   - backend/server.js doesn't talk to these tables yet (signup/login routes,
--     session/JWT handling, and swapping /scenarios over to query this table
--     instead of backend/scenarios.json + prompts/*.txt all still need code).
--   - Built-in scenario ids here are fresh uuids — they do NOT match the
--     string slugs used today (e.g. 'v-bolnitse') in scenarios.json or in the
--     prompts/<id>.txt filenames. The two id schemes only get reconciled once
--     the backend is migrated to read scenarios from this table.
-- ============================================================================

-- ── users ───────────────────────────────────────────────────────────────────
create table if not exists users (
  id             uuid primary key default gen_random_uuid(),
  email          varchar not null unique,
  password_hash  varchar not null,
  created_at     timestamptz not null default now(),
  is_active      boolean not null default true,
  name           varchar
);

-- ── scenarios ───────────────────────────────────────────────────────────────
-- owner_id NULL  = built-in, shared by every user
-- owner_id set   = personal, created by that one user
create table if not exists scenarios (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid references users(id) on delete cascade,
  scenario_name   varchar not null,
  scenario_prompt text not null,
  built_in        boolean not null default false,
  constraint scenarios_owner_matches_builtin check (
    (built_in and owner_id is null) or (not built_in and owner_id is not null)
  )
);

create index if not exists idx_scenarios_owner_id on scenarios(owner_id);

-- ── users_scenarios_mapping ─────────────────────────────────────────────────
-- Pins only (ownership lives on scenarios.owner_id, not here). A row means
-- "this user has this scenario pinned/visible in their list" — works the same
-- way for built-in and personal scenarios.
create table if not exists users_scenarios_mapping (
  user_id     uuid not null references users(id) on delete cascade,
  scenario_id uuid not null references scenarios(id) on delete cascade,
  primary key (user_id, scenario_id)
);

-- ── translations: add the two new columns to the EXISTING table ────────────
-- Both nullable: rows written before auth existed have no user/scenario to
-- point at, and Postgres won't let you add a NOT NULL column to a non-empty
-- table without a default. Going forward, application code should always
-- set both on insert — the schema just can't force that for old rows.
alter table translations
  add column if not exists user_id     uuid references users(id) on delete cascade,
  add column if not exists scenario_id uuid references scenarios(id) on delete set null;

create index if not exists idx_translations_user_id     on translations(user_id);
create index if not exists idx_translations_scenario_id on translations(scenario_id);


-- ============================================================================
-- OPTIONAL — seed the 8 current built-in scenarios (real prompt text, copied
-- from backend/prompts/*.txt) so scenarios/translations have something to
-- reference right away. Safe to skip or re-run — WHERE NOT EXISTS guards
-- against duplicate inserts on re-run (matched by scenario_name + built_in).
-- ============================================================================
insert into scenarios (scenario_name, scenario_prompt, built_in)
select v.name, v.prompt, true
from (values
  ('Незнакомец на улице', $$Ты профессиональный переводчик, специализирующийся на русском и корейском языках.
Контекст: разговор с незнакомым человеком на улице — вопросы о направлении, просьбы о помощи, уточнение местонахождения объектов, времени, транспорта.
Стиль: вежливый, нейтральный, без сленга. Используй стандартный регистр корейского языка (합쇼체 или 해요체) и уважительную форму русского.
Задание: переведи текст с {fromLang} языка на {toLang} язык.
Правило: верни ТОЛЬКО перевод — без пояснений, транслитерации, скобок и комментариев.$$),

  ('В магазине', $$Ты профессиональный переводчик, специализирующийся на русском и корейском языках.
Контекст: общение в магазине — выбор и покупка товаров, вопросы о цене, наличии, размерах, материале, скидках, обмене и возврате.
Стиль: вежливый деловой, подходящий для взаимодействия продавца и покупателя. Используй торговую лексику корейского и русского языков.
Задание: переведи текст с {fromLang} языка на {toLang} язык.
Правило: верни ТОЛЬКО перевод — без пояснений, транслитерации, скобок и комментариев.$$),

  ('В ресторане', $$Ты профессиональный переводчик, специализирующийся на русском и корейском языках.
Контекст: общение в ресторане или кафе — заказ блюд и напитков, уточнение состава, аллергенов, рекомендации персонала, запрос счёта, жалобы на качество еды.
Стиль: вежливый, ресторанный. Используй кулинарную лексику и принятые в сфере гостеприимства формулировки обоих языков.
Задание: переведи текст с {fromLang} языка на {toLang} язык.
Правило: верни ТОЛЬКО перевод — без пояснений, транслитерации, скобок и комментариев.$$),

  ('В банке', $$Ты профессиональный переводчик, специализирующийся на русском и корейском языках.
Контекст: обслуживание в банке — открытие счёта, обмен валюты, переводы, вопросы по карте, кредиту, документам для иностранцев.
Стиль: официально-деловой, точный. Финансовая и юридическая терминология должна быть переведена корректно.
Задание: переведи текст с {fromLang} языка на {toLang} язык.
Правило: верни ТОЛЬКО перевод — без пояснений, транслитерации, скобок и комментариев.$$),

  ('В больнице', $$Ты профессиональный переводчик, специализирующийся на русском и корейском языках.
Контекст: посещение больницы, поликлиники или аптеки — описание симптомов, назначение лечения, вопросы о препаратах, документах, страховке, записи к врачу.
Стиль: вежливый, медицинский. Используй точную медицинскую терминологию, избегай двусмысленности — от точности перевода зависит здоровье.
Задание: переведи текст с {fromLang} языка на {toLang} язык.
Правило: верни ТОЛЬКО перевод — без пояснений, транслитерации, скобок и комментариев.$$),

  ('В отеле', $$Ты профессиональный переводчик, специализирующийся на русском и корейском языках.
Контекст: взаимодействие с персоналом отеля — заселение и выезд, запросы в номер, жалобы, вопросы об услугах, экскурсиях, трансфере.
Стиль: вежливый гостиничный. Используй лексику сферы гостеприимства и туризма.
Задание: переведи текст с {fromLang} языка на {toLang} язык.
Правило: верни ТОЛЬКО перевод — без пояснений, транслитерации, скобок и комментариев.$$),

  ('В транспорте', $$Ты профессиональный переводчик, специализирующийся на русском и корейском языках.
Контекст: общение в транспорте — метро, автобус, такси, поезд, аэропорт. Вопросы о маршруте, остановках, билетах, задержках, пересадках.
Стиль: лаконичный, вежливый. Часто используются короткие фразы и вопросы — сохраняй их краткость при переводе.
Задание: переведи текст с {fromLang} языка на {toLang} язык.
Правило: верни ТОЛЬКО перевод — без пояснений, транслитерации, скобок и комментариев.$$),

  ('В ветеринарной клинике', $$Ты профессиональный переводчик, специализирующийся на русском и корейском языках.
Контекст: посещение ветеринарной клиники — описание симптомов и поведения животного, вопросы о диагнозе, лечении, прививках, анализах, стоимости услуг и уходе за питомцем.
Стиль: вежливый, ветеринарно-медицинский. Используй точную терминологию (название пород, симптомов, препаратов, процедур), избегай двусмысленности — от точности перевода зависит здоровье животного.
Задание: переведи текст с {fromLang} языка на {toLang} язык.
Правило: верни ТОЛЬКО перевод — без пояснений, транслитерации, скобок и комментариев.$$)
) as v(name, prompt)
where not exists (
  select 1 from scenarios s where s.scenario_name = v.name and s.built_in = true
);
