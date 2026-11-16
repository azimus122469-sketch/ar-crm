-- 004: архив данных по месяцам. Сервер сам делает копию раз в сутки (по Ташкенту), в месяце остаётся последняя.
-- Таблицы закрыты (RLS без политик), доступ только у функции ar-mcp.
create table if not exists ar_archive (
  month text primary key check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  taken_at timestamptz not null default now(),
  counts jsonb not null default '{}'::jsonb
);
create table if not exists ar_archive_data (
  month text primary key references ar_archive(month) on delete cascade,
  data jsonb not null
);
alter table ar_archive enable row level security;
alter table ar_archive_data enable row level security;
