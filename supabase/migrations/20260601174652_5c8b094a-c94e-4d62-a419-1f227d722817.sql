-- =========================================================================
-- Full schema sync migration
-- =========================================================================

-- ---------- Enum ----------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin','hr','executive','manager','employee');
  end if;
end $$;

-- ---------- Utility: updated_at trigger ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

-- =========================================================================
-- profiles
-- =========================================================================
create table if not exists public.profiles (
  id uuid primary key,
  display_name text not null,
  email text not null,
  manager_id uuid,
  employment_type text not null default 'full_time',
  timezone_preference text not null default 'UTC',
  timezone text not null default 'UTC',
  work_hours_id uuid,
  calendar_id uuid,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- =========================================================================
-- user_roles
-- =========================================================================
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  unique(user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

-- ---------- Role helpers ----------
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.current_user_roles()
returns setof public.app_role language sql stable security definer set search_path = public as $$
  select role from public.user_roles where user_id = auth.uid()
$$;

create or replace function public.is_manager_of(_employee uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = _employee and manager_id = auth.uid())
$$;

-- ---------- Profile policies ----------
drop policy if exists "view own profile" on public.profiles;
create policy "view own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update using (auth.uid() = id);
drop policy if exists "view reports" on public.profiles;
create policy "view reports" on public.profiles for select using (manager_id = auth.uid());
drop policy if exists "Managers can view direct report profiles" on public.profiles;
create policy "Managers can view direct report profiles" on public.profiles for select to authenticated using (manager_id = auth.uid() or id = auth.uid());
drop policy if exists "view all (hr/exec/admin)" on public.profiles;
create policy "view all (hr/exec/admin)" on public.profiles for select using (public.has_role(auth.uid(),'hr') or public.has_role(auth.uid(),'executive') or public.has_role(auth.uid(),'admin'));
drop policy if exists "admin update profile" on public.profiles;
create policy "admin update profile" on public.profiles for update using (public.has_role(auth.uid(),'admin'));

-- ---------- User role policies ----------
drop policy if exists "view own roles" on public.user_roles;
create policy "view own roles" on public.user_roles for select using (user_id = auth.uid());
drop policy if exists "admin view roles" on public.user_roles;
create policy "admin view roles" on public.user_roles for select using (public.has_role(auth.uid(),'admin'));
drop policy if exists "admin manage roles" on public.user_roles;
create policy "admin manage roles" on public.user_roles for all using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- ---------- New user trigger ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)), new.email)
  on conflict (id) do nothing;
  insert into public.user_roles(user_id, role) values (new.id, 'employee') on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- clients / projects
-- =========================================================================
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.clients to authenticated;
grant all on public.clients to service_role;
alter table public.clients enable row level security;
drop policy if exists "auth read clients" on public.clients;
create policy "auth read clients" on public.clients for select using (auth.uid() is not null);
drop policy if exists "admin write clients" on public.clients;
create policy "admin write clients" on public.clients for all using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'hr')) with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'hr'));

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  code text not null,
  name text not null,
  billable boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.projects to authenticated;
grant all on public.projects to service_role;
alter table public.projects enable row level security;
drop policy if exists "auth read projects" on public.projects;
create policy "auth read projects" on public.projects for select using (auth.uid() is not null);
drop policy if exists "admin write projects" on public.projects;
create policy "admin write projects" on public.projects for all using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'hr')) with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'hr'));

-- =========================================================================
-- holiday_calendars / holidays
-- =========================================================================
create table if not exists public.holiday_calendars (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_code text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.holiday_calendars to authenticated;
grant all on public.holiday_calendars to service_role;
alter table public.holiday_calendars enable row level security;
drop policy if exists "auth read calendars" on public.holiday_calendars;
create policy "auth read calendars" on public.holiday_calendars for select using (auth.uid() is not null);
drop policy if exists "admin hr write calendars" on public.holiday_calendars;
create policy "admin hr write calendars" on public.holiday_calendars for all using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'hr')) with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'hr'));

create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null,
  name text not null,
  holiday_date date not null,
  is_full_day boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.holidays to authenticated;
grant all on public.holidays to service_role;
alter table public.holidays enable row level security;
drop policy if exists "auth read holidays" on public.holidays;
create policy "auth read holidays" on public.holidays for select using (auth.uid() is not null);
drop policy if exists "admin hr write holidays" on public.holidays;
create policy "admin hr write holidays" on public.holidays for all using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'hr')) with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'hr'));

-- =========================================================================
-- user_work_hours
-- =========================================================================
create table if not exists public.user_work_hours (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_time time not null default '09:00:00',
  end_time time not null default '17:00:00',
  grace_window_minutes int not null default 15,
  working_days smallint[] not null default array[1,2,3,4,5]::smallint[],
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.user_work_hours to authenticated;
grant all on public.user_work_hours to service_role;
alter table public.user_work_hours enable row level security;
drop policy if exists "auth read work hours" on public.user_work_hours;
create policy "auth read work hours" on public.user_work_hours for select using (auth.uid() is not null);
drop policy if exists "admin hr write work hours" on public.user_work_hours;
create policy "admin hr write work hours" on public.user_work_hours for all using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'hr')) with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'hr'));

-- =========================================================================
-- attendance (raw ingestion table)
-- =========================================================================
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  type text not null,
  timestamp timestamptz not null default now(),
  source text not null default 'power_automate_email',
  raw_subject text,
  created_at timestamptz not null default now()
);
grant select, insert on public.attendance to authenticated;
grant all on public.attendance to service_role;
alter table public.attendance enable row level security;
drop policy if exists "own attendance read" on public.attendance;
create policy "own attendance read" on public.attendance for select using (email = (select p.email from public.profiles p where p.id = auth.uid()));
drop policy if exists "admin hr exec read attendance" on public.attendance;
create policy "admin hr exec read attendance" on public.attendance for select using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'hr') or public.has_role(auth.uid(),'executive'));

-- =========================================================================
-- attendance_sessions
-- =========================================================================
create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  work_date date not null,
  check_in_time timestamptz not null,
  check_out_time timestamptz,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.attendance_sessions to authenticated;
grant all on public.attendance_sessions to service_role;
alter table public.attendance_sessions enable row level security;
drop policy if exists "own sessions" on public.attendance_sessions;
create policy "own sessions" on public.attendance_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "manager view sessions" on public.attendance_sessions;
create policy "manager view sessions" on public.attendance_sessions for select using (public.is_manager_of(user_id));
drop policy if exists "hr exec view sessions" on public.attendance_sessions;
create policy "hr exec view sessions" on public.attendance_sessions for select using (public.has_role(auth.uid(),'hr') or public.has_role(auth.uid(),'executive') or public.has_role(auth.uid(),'admin'));
drop trigger if exists trg_attendance_sessions_updated on public.attendance_sessions;
create trigger trg_attendance_sessions_updated before update on public.attendance_sessions for each row execute function public.touch_updated_at();

-- =========================================================================
-- attendance_events
-- =========================================================================
create table if not exists public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid,
  user_id uuid not null,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  source text not null default 'web',
  metadata jsonb not null default '{}'::jsonb
);
grant select, insert on public.attendance_events to authenticated;
grant all on public.attendance_events to service_role;
alter table public.attendance_events enable row level security;
drop policy if exists "own events" on public.attendance_events;
create policy "own events" on public.attendance_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "manager view events" on public.attendance_events;
create policy "manager view events" on public.attendance_events for select using (public.is_manager_of(user_id));
drop policy if exists "hr exec view events" on public.attendance_events;
create policy "hr exec view events" on public.attendance_events for select using (public.has_role(auth.uid(),'hr') or public.has_role(auth.uid(),'executive') or public.has_role(auth.uid(),'admin'));

-- =========================================================================
-- activity_signals
-- =========================================================================
create table if not exists public.activity_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  signal_type text not null,
  source text not null,
  occurred_at timestamptz not null,
  duration_minutes int,
  project_hint text,
  email text default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.activity_signals to authenticated;
grant all on public.activity_signals to service_role;
alter table public.activity_signals enable row level security;
drop policy if exists "own signals" on public.activity_signals;
create policy "own signals" on public.activity_signals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "manager view signals" on public.activity_signals;
create policy "manager view signals" on public.activity_signals for select using (public.is_manager_of(user_id));
drop policy if exists "hr exec view signals" on public.activity_signals;
create policy "hr exec view signals" on public.activity_signals for select using (public.has_role(auth.uid(),'hr') or public.has_role(auth.uid(),'executive') or public.has_role(auth.uid(),'admin'));

-- =========================================================================
-- work_sessions
-- =========================================================================
create table if not exists public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  check_in timestamptz not null default now(),
  check_out timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.work_sessions to authenticated;
grant all on public.work_sessions to service_role;
alter table public.work_sessions enable row level security;
drop policy if exists "own sessions" on public.work_sessions;
create policy "own sessions" on public.work_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "manager view sessions" on public.work_sessions;
create policy "manager view sessions" on public.work_sessions for select using (public.is_manager_of(user_id));
drop policy if exists "hr exec view sessions" on public.work_sessions;
create policy "hr exec view sessions" on public.work_sessions for select using (public.has_role(auth.uid(),'hr') or public.has_role(auth.uid(),'executive') or public.has_role(auth.uid(),'admin'));

-- =========================================================================
-- draft_timesheets
-- =========================================================================
create table if not exists public.draft_timesheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  week_start date not null,
  status text not null default 'draft',
  ai_summary text,
  ai_confidence numeric,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.draft_timesheets to authenticated;
grant all on public.draft_timesheets to service_role;
alter table public.draft_timesheets enable row level security;
drop policy if exists "own timesheets" on public.draft_timesheets;
create policy "own timesheets" on public.draft_timesheets for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "manager view timesheets" on public.draft_timesheets;
create policy "manager view timesheets" on public.draft_timesheets for select using (public.is_manager_of(user_id));
drop policy if exists "manager update timesheets" on public.draft_timesheets;
create policy "manager update timesheets" on public.draft_timesheets for update using (public.is_manager_of(user_id));
drop policy if exists "hr exec view timesheets" on public.draft_timesheets;
create policy "hr exec view timesheets" on public.draft_timesheets for select using (public.has_role(auth.uid(),'hr') or public.has_role(auth.uid(),'executive') or public.has_role(auth.uid(),'admin'));
drop trigger if exists trg_draft_timesheets_updated on public.draft_timesheets;
create trigger trg_draft_timesheets_updated before update on public.draft_timesheets for each row execute function public.touch_updated_at();

-- =========================================================================
-- timesheet_entries
-- =========================================================================
create table if not exists public.timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null,
  project_id uuid,
  category text not null default 'project',
  hours numeric not null default 0,
  ai_confidence numeric,
  ai_rationale text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.timesheet_entries to authenticated;
grant all on public.timesheet_entries to service_role;
alter table public.timesheet_entries enable row level security;
drop policy if exists "own entries" on public.timesheet_entries;
create policy "own entries" on public.timesheet_entries for all
  using (exists (select 1 from public.draft_timesheets t where t.id = timesheet_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.draft_timesheets t where t.id = timesheet_id and t.user_id = auth.uid()));
drop policy if exists "manager view entries" on public.timesheet_entries;
create policy "manager view entries" on public.timesheet_entries for select using (exists (select 1 from public.draft_timesheets t where t.id = timesheet_id and public.is_manager_of(t.user_id)));
drop policy if exists "hr exec view entries" on public.timesheet_entries;
create policy "hr exec view entries" on public.timesheet_entries for select using (public.has_role(auth.uid(),'hr') or public.has_role(auth.uid(),'executive') or public.has_role(auth.uid(),'admin'));

-- =========================================================================
-- timesheet_approvals
-- =========================================================================
create table if not exists public.timesheet_approvals (
  id uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null,
  manager_id uuid not null,
  decision text not null,
  comment text,
  decided_at timestamptz not null default now()
);
grant select, insert on public.timesheet_approvals to authenticated;
grant all on public.timesheet_approvals to service_role;
alter table public.timesheet_approvals enable row level security;
drop policy if exists "view approvals (employee/manager/hr)" on public.timesheet_approvals;
create policy "view approvals (employee/manager/hr)" on public.timesheet_approvals for select using (
  manager_id = auth.uid()
  or exists (select 1 from public.draft_timesheets t where t.id = timesheet_id and t.user_id = auth.uid())
  or public.has_role(auth.uid(),'hr') or public.has_role(auth.uid(),'executive') or public.has_role(auth.uid(),'admin')
);
drop policy if exists "manager insert approval" on public.timesheet_approvals;
create policy "manager insert approval" on public.timesheet_approvals for insert with check (
  manager_id = auth.uid() and exists (select 1 from public.draft_timesheets t where t.id = timesheet_id and public.is_manager_of(t.user_id))
);

-- =========================================================================
-- outbox_events
-- =========================================================================
create table if not exists public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts int not null default 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
grant all on public.outbox_events to service_role;
alter table public.outbox_events enable row level security;

-- =========================================================================
-- audit_logs
-- =========================================================================
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_kind text not null default 'user',
  action text not null,
  target_table text,
  target_id uuid,
  before jsonb,
  after jsonb,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;
drop policy if exists "admin hr exec read audit" on public.audit_logs;
create policy "admin hr exec read audit" on public.audit_logs for select using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'hr') or public.has_role(auth.uid(),'executive'));

-- =========================================================================
-- idempotency_keys
-- =========================================================================
create table if not exists public.idempotency_keys (
  key text primary key,
  created_at timestamptz not null default now()
);
grant all on public.idempotency_keys to service_role;
alter table public.idempotency_keys enable row level security;

-- =========================================================================
-- identity_mappings
-- =========================================================================
create table if not exists public.identity_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source text not null,
  external_id text not null
);
grant select, insert, update, delete on public.identity_mappings to authenticated;
grant all on public.identity_mappings to service_role;
alter table public.identity_mappings enable row level security;
drop policy if exists "own mappings" on public.identity_mappings;
create policy "own mappings" on public.identity_mappings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "hr exec view mappings" on public.identity_mappings;
create policy "hr exec view mappings" on public.identity_mappings for select using (public.has_role(auth.uid(),'hr') or public.has_role(auth.uid(),'admin'));

-- =========================================================================
-- teams_connections
-- =========================================================================
create table if not exists public.teams_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  team_internal_id text not null,
  team_aad_id text,
  team_name text not null,
  channel_id text not null,
  service_url text not null,
  installed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.teams_connections to authenticated;
grant all on public.teams_connections to service_role;
alter table public.teams_connections enable row level security;
drop policy if exists "admin read teams_connections" on public.teams_connections;
create policy "admin read teams_connections" on public.teams_connections for select using (public.has_role(auth.uid(),'admin'));
drop policy if exists "admin write teams_connections" on public.teams_connections;
create policy "admin write teams_connections" on public.teams_connections for all using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
drop trigger if exists trg_teams_connections_updated on public.teams_connections;
create trigger trg_teams_connections_updated before update on public.teams_connections for each row execute function public.touch_updated_at();

-- =========================================================================
-- app_settings
-- =========================================================================
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;
drop policy if exists "admin read settings" on public.app_settings;
create policy "admin read settings" on public.app_settings for select using (public.has_role(auth.uid(),'admin'));
drop policy if exists "admin write settings" on public.app_settings;
create policy "admin write settings" on public.app_settings for all using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- =========================================================================
-- Domain functions
-- =========================================================================
create or replace function public.record_attendance_action(
  p_action text, p_idempotency_key text, p_work_date date,
  p_occurred_at timestamptz default now(), p_source text default 'web', p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_session public.attendance_sessions%rowtype;
  v_event_id uuid;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  if p_action not in ('check_in','check_out') then raise exception 'invalid action %', p_action using errcode='22023'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then raise exception 'idempotency_key required' using errcode='22023'; end if;

  begin
    insert into public.idempotency_keys(key) values (p_idempotency_key);
  exception when unique_violation then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end;

  if p_action = 'check_in' then
    select * into v_session from public.attendance_sessions
      where user_id = v_uid and work_date = p_work_date and status='open' for update;
    if found then raise exception 'already_checked_in' using errcode='P0001'; end if;
    insert into public.attendance_sessions(user_id, work_date, check_in_time, status)
      values (v_uid, p_work_date, p_occurred_at, 'open') returning * into v_session;
  else
    select * into v_session from public.attendance_sessions
      where user_id = v_uid and work_date = p_work_date and status='open' for update;
    if not found then raise exception 'no_open_session' using errcode='P0001'; end if;
    update public.attendance_sessions set check_out_time = p_occurred_at, status='closed'
      where id = v_session.id returning * into v_session;
  end if;

  insert into public.attendance_events(session_id, user_id, event_type, occurred_at, source, metadata)
    values (v_session.id, v_uid, p_action, p_occurred_at, p_source, p_metadata) returning id into v_event_id;

  insert into public.outbox_events(event_type, payload) values (
    'attendance.' || p_action,
    jsonb_build_object('user_id', v_uid, 'session_id', v_session.id, 'event_id', v_event_id,
                       'work_date', p_work_date, 'occurred_at', p_occurred_at, 'metadata', p_metadata)
  );

  return jsonb_build_object('ok', true, 'duplicate', false, 'session_id', v_session.id, 'event_id', v_event_id, 'status', v_session.status);
end $$;

create or replace function public.reconcile_missed_checkouts(p_cutoff_hours int default 14, p_default_hours int default 8)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row record; v_closed int := 0; v_estimated_out timestamptz;
begin
  for v_row in
    select id, user_id, work_date, check_in_time from public.attendance_sessions
    where status='open' and check_in_time < now() - make_interval(hours => p_cutoff_hours) for update skip locked
  loop
    v_estimated_out := least(v_row.check_in_time + make_interval(hours => p_default_hours), now());
    update public.attendance_sessions set check_out_time = v_estimated_out, status='closed', updated_at=now() where id = v_row.id;
    insert into public.attendance_events(session_id, user_id, event_type, occurred_at, source, metadata)
      values (v_row.id, v_row.user_id, 'auto_check_out', v_estimated_out, 'reconciliation',
              jsonb_build_object('reason','missed_checkout','default_hours', p_default_hours));
    insert into public.audit_logs(actor_id, actor_kind, action, target_table, target_id, before, after, context)
      values (null,'system','attendance.auto_close','attendance_sessions', v_row.id,
              jsonb_build_object('status','open','check_out_time', null),
              jsonb_build_object('status','closed','check_out_time', v_estimated_out),
              jsonb_build_object('reason','missed_checkout','cutoff_hours',p_cutoff_hours));
    insert into public.outbox_events(event_type, payload) values ('attendance.auto_close',
      jsonb_build_object('user_id', v_row.user_id, 'session_id', v_row.id, 'work_date', v_row.work_date, 'estimated_check_out', v_estimated_out));
    v_closed := v_closed + 1;
  end loop;
  return jsonb_build_object('closed', v_closed, 'cutoff_hours', p_cutoff_hours);
end $$;
