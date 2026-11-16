-- 003: выбор модели и пометки о вложениях в чате помощника.
-- Сами вложения в базе не хранятся: они живут только в запросе к функции.
alter table ar_chat add column if not exists model text;
alter table ar_chat add column if not exists attachments jsonb not null default '[]'::jsonb;
