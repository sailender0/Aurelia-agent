CREATE TABLE public.teams_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_name text NOT NULL,
  team_aad_id text,
  team_internal_id text NOT NULL,
  channel_id text NOT NULL,
  tenant_id text NOT NULL,
  service_url text NOT NULL,
  installed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_internal_id, channel_id)
);

ALTER TABLE public.teams_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read teams_connections"
  ON public.teams_connections FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin write teams_connections"
  ON public.teams_connections FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER teams_connections_touch
  BEFORE UPDATE ON public.teams_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();