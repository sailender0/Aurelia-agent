
-- ============ AUDIT LOGS ============
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,                     -- null for system
  actor_kind text not null default 'user', -- 'user' | 'system' | 'webhook'
  action text not null,              -- e.g. 'timesheet.approve'
  target_table text,
  target_id uuid,
  before jsonb,
  after jsonb,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_action_idx on public.audit_logs(action);
create index if not exists audit_logs_target_idx on public.audit_logs(target_table, target_id);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);

alter table public.audit_logs enable row level security;

create policy "admin hr exec read audit"
on public.audit_logs for select
using (
  has_role(auth.uid(),'admin'::app_role)
  or has_role(auth.uid(),'hr'::app_role)
  or has_role(auth.uid(),'executive'::app_role)
);
-- No insert/update/delete policies → only service role can write.

-- ============ RECONCILIATION ============
-- Auto-close any 'open' attendance_sessions whose check_in_time is older than
-- p_cutoff_hours. Sets check_out_time to check_in_time + p_default_hours (capped
-- to now()), writes an attendance_event, an audit_log row and an outbox_event.
create or replace function public.reconcile_missed_checkouts(
  p_cutoff_hours int default 14,
  p_default_hours int default 8
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_closed int := 0;
  v_estimated_out timestamptz;
begin
  for v_row in
    select id, user_id, work_date, check_in_time
    from public.attendance_sessions
    where status = 'open'
      and check_in_time < now() - make_interval(hours => p_cutoff_hours)
    for update skip locked
  loop
    v_estimated_out := least(v_row.check_in_time + make_interval(hours => p_default_hours), now());

    update public.attendance_sessions
      set check_out_time = v_estimated_out,
          status = 'closed',
          updated_at = now()
      where id = v_row.id;

    insert into public.attendance_events(session_id, user_id, event_type, occurred_at, source, metadata)
    values (v_row.id, v_row.user_id, 'auto_check_out', v_estimated_out, 'reconciliation',
            jsonb_build_object('reason','missed_checkout','default_hours', p_default_hours));

    insert into public.audit_logs(actor_id, actor_kind, action, target_table, target_id, before, after, context)
    values (null, 'system', 'attendance.auto_close', 'attendance_sessions', v_row.id,
            jsonb_build_object('status','open','check_out_time', null),
            jsonb_build_object('status','closed','check_out_time', v_estimated_out),
            jsonb_build_object('reason','missed_checkout','cutoff_hours',p_cutoff_hours));

    insert into public.outbox_events(event_type, payload)
    values ('attendance.auto_close',
            jsonb_build_object(
              'user_id', v_row.user_id,
              'session_id', v_row.id,
              'work_date', v_row.work_date,
              'estimated_check_out', v_estimated_out));

    v_closed := v_closed + 1;
  end loop;

  return jsonb_build_object('closed', v_closed, 'cutoff_hours', p_cutoff_hours);
end;
$$;
