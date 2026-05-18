-- ============ Reference tables ============
CREATE TABLE public.holiday_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id uuid NOT NULL REFERENCES public.holiday_calendars(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  name text NOT NULL,
  is_full_day boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (calendar_id, holiday_date)
);
CREATE INDEX idx_holidays_calendar_date ON public.holidays(calendar_id, holiday_date);

CREATE TABLE public.user_work_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_time time NOT NULL DEFAULT '09:00',
  end_time time NOT NULL DEFAULT '17:00',
  working_days smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::smallint[], -- ISO weekday 1=Mon..7=Sun
  grace_window_minutes integer NOT NULL DEFAULT 15,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ Profiles linkage ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone_preference text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS work_hours_id uuid REFERENCES public.user_work_hours(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS calendar_id uuid REFERENCES public.holiday_calendars(id) ON DELETE SET NULL;

-- ============ Attendance core ============
CREATE TABLE public.attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  work_date date NOT NULL,
  check_in_time timestamptz NOT NULL,
  check_out_time timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','void')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_att_sessions_user_date ON public.attendance_sessions(user_id, work_date);
CREATE UNIQUE INDEX uniq_att_sessions_open_per_day
  ON public.attendance_sessions(user_id, work_date) WHERE status = 'open';

CREATE TABLE public.attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.attendance_sessions(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('check_in','check_out','auto_close','void')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'web',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_att_events_user_time ON public.attendance_events(user_id, occurred_at DESC);

-- ============ Idempotency & outbox (server-only) ============
CREATE TABLE public.idempotency_keys (
  key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX idx_outbox_pending ON public.outbox_events(created_at) WHERE status = 'pending';

-- ============ touch_updated_at on sessions ============
CREATE TRIGGER attendance_sessions_touch
  BEFORE UPDATE ON public.attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ RLS ============
ALTER TABLE public.holiday_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_work_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;

-- Reference data readable by any authenticated user, writable by hr/admin
CREATE POLICY "auth read calendars" ON public.holiday_calendars FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin hr write calendars" ON public.holiday_calendars FOR ALL
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'hr'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'hr'));

CREATE POLICY "auth read holidays" ON public.holidays FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin hr write holidays" ON public.holidays FOR ALL
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'hr'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'hr'));

CREATE POLICY "auth read work hours" ON public.user_work_hours FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin hr write work hours" ON public.user_work_hours FOR ALL
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'hr'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'hr'));

-- Attendance: own data, manager-visible (reuse is_manager_of), hr/exec/admin all
CREATE POLICY "own sessions" ON public.attendance_sessions FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "manager view sessions" ON public.attendance_sessions FOR SELECT
  USING (is_manager_of(user_id));
CREATE POLICY "hr exec view sessions" ON public.attendance_sessions FOR SELECT
  USING (has_role(auth.uid(),'hr') OR has_role(auth.uid(),'executive') OR has_role(auth.uid(),'admin'));

CREATE POLICY "own events" ON public.attendance_events FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "manager view events" ON public.attendance_events FOR SELECT
  USING (is_manager_of(user_id));
CREATE POLICY "hr exec view events" ON public.attendance_events FOR SELECT
  USING (has_role(auth.uid(),'hr') OR has_role(auth.uid(),'executive') OR has_role(auth.uid(),'admin'));

-- idempotency_keys and outbox_events: RLS enabled with NO policies -> service role only
-- (anon/authenticated cannot read or write; backend uses supabaseAdmin)

-- ============ Transactional attendance action ============
-- All-in-one: verify idempotency, open/close session, append event, enqueue outbox.
-- Runs as SECURITY DEFINER but is locked to the caller's auth.uid().
CREATE OR REPLACE FUNCTION public.record_attendance_action(
  p_action text,
  p_idempotency_key text,
  p_work_date date,
  p_occurred_at timestamptz DEFAULT now(),
  p_source text DEFAULT 'web',
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_session public.attendance_sessions%ROWTYPE;
  v_event_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('check_in','check_out') THEN
    RAISE EXCEPTION 'invalid action %', p_action USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'idempotency_key required' USING ERRCODE = '22023';
  END IF;

  -- Idempotency: PK insert; duplicate => no-op success
  BEGIN
    INSERT INTO public.idempotency_keys(key) VALUES (p_idempotency_key);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END;

  IF p_action = 'check_in' THEN
    -- Refuse if an open session already exists for the day
    SELECT * INTO v_session FROM public.attendance_sessions
      WHERE user_id = v_uid AND work_date = p_work_date AND status = 'open'
      FOR UPDATE;
    IF FOUND THEN
      RAISE EXCEPTION 'already_checked_in' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.attendance_sessions(user_id, work_date, check_in_time, status)
    VALUES (v_uid, p_work_date, p_occurred_at, 'open')
    RETURNING * INTO v_session;
  ELSE
    SELECT * INTO v_session FROM public.attendance_sessions
      WHERE user_id = v_uid AND work_date = p_work_date AND status = 'open'
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'no_open_session' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.attendance_sessions
      SET check_out_time = p_occurred_at, status = 'closed'
      WHERE id = v_session.id
      RETURNING * INTO v_session;
  END IF;

  INSERT INTO public.attendance_events(session_id, user_id, event_type, occurred_at, source, metadata)
  VALUES (v_session.id, v_uid, p_action, p_occurred_at, p_source, p_metadata)
  RETURNING id INTO v_event_id;

  INSERT INTO public.outbox_events(event_type, payload)
  VALUES (
    'attendance.' || p_action,
    jsonb_build_object(
      'user_id', v_uid,
      'session_id', v_session.id,
      'event_id', v_event_id,
      'work_date', p_work_date,
      'occurred_at', p_occurred_at,
      'metadata', p_metadata
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'session_id', v_session.id,
    'event_id', v_event_id,
    'status', v_session.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_attendance_action(text,text,date,timestamptz,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_attendance_action(text,text,date,timestamptz,text,jsonb) TO authenticated;