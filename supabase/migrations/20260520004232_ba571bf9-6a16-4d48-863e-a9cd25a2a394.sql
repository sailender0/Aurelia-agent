
CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('check_in','check_out')),
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'power_automate_email',
  raw_subject TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_email_ts ON public.attendance(email, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_ts ON public.attendance("timestamp" DESC);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin hr exec read attendance"
  ON public.attendance FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR has_role(auth.uid(), 'executive'::app_role)
  );

CREATE POLICY "own attendance read"
  ON public.attendance FOR SELECT
  USING (
    email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
  );
