
-- Roles enum
create type public.app_role as enum ('employee', 'manager', 'hr', 'executive', 'admin');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null,
  manager_id uuid references public.profiles(id) on delete set null,
  employment_type text not null default 'full_time',
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- user_roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

-- has_role security definer
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- get current user roles
create or replace function public.current_user_roles()
returns setof app_role
language sql stable security definer set search_path = public
as $$ select role from public.user_roles where user_id = auth.uid() $$;

-- is manager of
create or replace function public.is_manager_of(_employee uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = _employee and manager_id = auth.uid())
$$;

-- Clients
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.clients enable row level security;

-- Projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  code text not null unique,
  billable boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.projects enable row level security;

-- Work sessions (check-in/out)
create table public.work_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  check_in timestamptz not null default now(),
  check_out timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.work_sessions enable row level security;
create index on public.work_sessions(user_id, check_in desc);

-- Activity signals (metadata only)
create table public.activity_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null, -- 'teams','jira','github','calendar','azure_devops'
  signal_type text not null, -- 'meeting','commit','ticket_update','calendar_event'
  project_hint text,
  occurred_at timestamptz not null,
  duration_minutes integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.activity_signals enable row level security;
create index on public.activity_signals(user_id, occurred_at desc);

-- Identity mappings
create table public.identity_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  external_id text not null,
  unique (source, external_id)
);
alter table public.identity_mappings enable row level security;

-- Draft timesheets (weekly)
create table public.draft_timesheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null, -- Monday
  status text not null default 'draft', -- draft|submitted|approved|rejected
  ai_summary text,
  ai_confidence numeric(4,3),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);
alter table public.draft_timesheets enable row level security;

-- Entries inside a timesheet
create table public.timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null references public.draft_timesheets(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  category text not null default 'project', -- project|internal|support|leave|unclassified
  hours numeric(5,2) not null default 0,
  ai_confidence numeric(4,3),
  ai_rationale text,
  created_at timestamptz not null default now()
);
alter table public.timesheet_entries enable row level security;

-- Approvals
create table public.timesheet_approvals (
  id uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null references public.draft_timesheets(id) on delete cascade,
  manager_id uuid not null references auth.users(id) on delete cascade,
  decision text not null, -- approved|rejected
  comment text,
  decided_at timestamptz not null default now()
);
alter table public.timesheet_approvals enable row level security;

-- ============= RLS POLICIES =============

-- profiles
create policy "view own profile" on public.profiles for select using (auth.uid() = id);
create policy "view reports" on public.profiles for select using (manager_id = auth.uid());
create policy "view all (hr/exec/admin)" on public.profiles for select using (
  public.has_role(auth.uid(),'hr') or public.has_role(auth.uid(),'executive') or public.has_role(auth.uid(),'admin')
);
create policy "insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "update own profile" on public.profiles for update using (auth.uid() = id);
create policy "admin update profile" on public.profiles for update using (public.has_role(auth.uid(),'admin'));

-- user_roles: only admins manage
create policy "view own roles" on public.user_roles for select using (user_id = auth.uid());
create policy "admin view roles" on public.user_roles for select using (public.has_role(auth.uid(),'admin'));
create policy "admin manage roles" on public.user_roles for all using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- clients & projects: all authenticated read; admin/hr write
create policy "auth read clients" on public.clients for select using (auth.uid() is not null);
create policy "admin write clients" on public.clients for all using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'hr')) with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'hr'));

create policy "auth read projects" on public.projects for select using (auth.uid() is not null);
create policy "admin write projects" on public.projects for all using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'hr')) with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'hr'));

-- work_sessions
create policy "own sessions" on public.work_sessions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "manager view sessions" on public.work_sessions for select using (public.is_manager_of(user_id));
create policy "hr exec view sessions" on public.work_sessions for select using (
  public.has_role(auth.uid(),'hr') or public.has_role(auth.uid(),'executive') or public.has_role(auth.uid(),'admin')
);

-- activity_signals
create policy "own signals" on public.activity_signals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "manager view signals" on public.activity_signals for select using (public.is_manager_of(user_id));
create policy "hr exec view signals" on public.activity_signals for select using (
  public.has_role(auth.uid(),'hr') or public.has_role(auth.uid(),'executive') or public.has_role(auth.uid(),'admin')
);

-- identity mappings
create policy "own mappings" on public.identity_mappings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "hr exec view mappings" on public.identity_mappings for select using (
  public.has_role(auth.uid(),'hr') or public.has_role(auth.uid(),'admin')
);

-- draft_timesheets
create policy "own timesheets" on public.draft_timesheets for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "manager view timesheets" on public.draft_timesheets for select using (public.is_manager_of(user_id));
create policy "manager update timesheets" on public.draft_timesheets for update using (public.is_manager_of(user_id));
create policy "hr exec view timesheets" on public.draft_timesheets for select using (
  public.has_role(auth.uid(),'hr') or public.has_role(auth.uid(),'executive') or public.has_role(auth.uid(),'admin')
);

-- timesheet_entries
create policy "own entries" on public.timesheet_entries for all using (
  exists (select 1 from public.draft_timesheets t where t.id = timesheet_id and t.user_id = auth.uid())
) with check (
  exists (select 1 from public.draft_timesheets t where t.id = timesheet_id and t.user_id = auth.uid())
);
create policy "manager view entries" on public.timesheet_entries for select using (
  exists (select 1 from public.draft_timesheets t where t.id = timesheet_id and public.is_manager_of(t.user_id))
);
create policy "hr exec view entries" on public.timesheet_entries for select using (
  public.has_role(auth.uid(),'hr') or public.has_role(auth.uid(),'executive') or public.has_role(auth.uid(),'admin')
);

-- timesheet_approvals
create policy "manager insert approval" on public.timesheet_approvals for insert with check (
  manager_id = auth.uid() and exists (
    select 1 from public.draft_timesheets t where t.id = timesheet_id and public.is_manager_of(t.user_id)
  )
);
create policy "view approvals (employee/manager/hr)" on public.timesheet_approvals for select using (
  manager_id = auth.uid()
  or exists (select 1 from public.draft_timesheets t where t.id = timesheet_id and t.user_id = auth.uid())
  or public.has_role(auth.uid(),'hr') or public.has_role(auth.uid(),'executive') or public.has_role(auth.uid(),'admin')
);

-- Auto-create profile + employee role on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)),
    new.email
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'employee')
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
