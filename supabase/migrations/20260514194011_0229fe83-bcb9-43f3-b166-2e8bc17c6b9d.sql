create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create policy "admin read settings" on public.app_settings for select using (has_role(auth.uid(), 'admin'));
create policy "admin write settings" on public.app_settings for all using (has_role(auth.uid(), 'admin')) with check (has_role(auth.uid(), 'admin'));