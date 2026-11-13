-- АР · Тетрадь: устройства, токены MCP, чат помощника, предложения.
-- Всё закрыто: RLS включён, политик нет. Доступ только у серверной функции ar-mcp (service role).

create table if not exists ar_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  who text not null check (who in ('aziz','redvan')),
  platform text not null default '',
  token_hash text not null unique,
  is_main boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists ar_devices_one_main on ar_devices (is_main) where is_main and revoked_at is null;

create table if not exists ar_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  who text not null check (who in ('aziz','redvan')),
  created_by uuid references ar_devices(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists ar_tokens (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_hash text not null unique,
  created_by uuid references ar_devices(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table if not exists ar_actions (
  id uuid primary key default gen_random_uuid(),
  summary text not null,
  ops jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','failed')),
  error text,
  token_id uuid,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);

create table if not exists ar_chat (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('user','assistant')),
  who text,
  content text not null,
  action_id uuid references ar_actions(id),
  created_at timestamptz not null default now()
);

alter table ar_devices enable row level security;
alter table ar_invites enable row level security;
alter table ar_tokens enable row level security;
alter table ar_actions enable row level security;
alter table ar_chat enable row level security;
