ALTER TABLE public.draft_timesheets
  ADD CONSTRAINT draft_timesheets_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;