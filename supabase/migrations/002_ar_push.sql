-- АР · Тетрадь: напоминания (Web Push) и расписание.
-- Таблицы закрыты (RLS без политик), доступ только у функции ar-mcp.

create table if not exists ar_vapid (
  id int primary key default 1 check (id = 1),
  public_key text,
  private_key text,
  cron_secret text not null default encode(gen_random_bytes(24), 'hex')
);
insert into ar_vapid (id) values (1) on conflict (id) do nothing;

create table if not exists ar_push (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references ar_devices(id) on delete cascade,
  who text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  hour int not null default 19,
  tz_min int not null default 300,
  enabled boolean not null default true,
  last_sent text,
  created_at timestamptz not null default now()
);

alter table ar_vapid enable row level security;
alter table ar_push enable row level security;

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- каждые 15 минут функция проверяет, не пора ли напомнить
select cron.unschedule('ar-remind-tick') where exists (select 1 from cron.job where jobname = 'ar-remind-tick');
select cron.schedule('ar-remind-tick', '*/15 * * * *', $job$
  select net.http_post(
    url := 'https://aoqmwcniuddvgydrsgij.supabase.co/functions/v1/ar-mcp/push/tick',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ar-cron', (select cron_secret from public.ar_vapid where id = 1)),
    body := '{}'::jsonb
  );
$job$);
