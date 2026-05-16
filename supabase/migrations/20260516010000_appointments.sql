-- Appointments table for AI Task Manager
-- Separate from legacy calendar_events; supports Google Calendar sync + 3-level reminders

CREATE TABLE IF NOT EXISTS public.appointments (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id           uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title                text        NOT NULL,
  starts_at            timestamptz NOT NULL,
  google_event_id      text,
  reminded_day_before  boolean     NOT NULL DEFAULT false,
  reminded_day_of      boolean     NOT NULL DEFAULT false,
  reminded_1h_before   boolean     NOT NULL DEFAULT false,
  source               text        NOT NULL DEFAULT 'line',
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_all" ON public.appointments FOR ALL
  USING (profile_id = auth.uid());

CREATE POLICY "admin_all" ON public.appointments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX appointments_profile_starts_idx ON public.appointments (profile_id, starts_at);
CREATE INDEX appointments_reminders_idx      ON public.appointments (starts_at)
  WHERE reminded_day_before = false OR reminded_day_of = false OR reminded_1h_before = false;
