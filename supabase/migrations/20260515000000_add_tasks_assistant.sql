-- AI Task Manager: tasks table
CREATE TABLE public.tasks (
  id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id           UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title                TEXT        NOT NULL,
  description          TEXT,
  status               TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','cancelled','postponed')),
  priority             TEXT        NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low','medium','high','urgent')),
  due_at               TIMESTAMPTZ,
  remind_at            TIMESTAMPTZ,
  remind_before_minutes INT        DEFAULT 15,
  follow_up_sent_at    TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  source               TEXT        DEFAULT 'line'
    CHECK (source IN ('line','web','system')),
  raw_input            TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select_own"  ON public.tasks FOR SELECT  USING (profile_id = auth.uid());
CREATE POLICY "tasks_insert_own"  ON public.tasks FOR INSERT  WITH CHECK (profile_id = auth.uid());
CREATE POLICY "tasks_update_own"  ON public.tasks FOR UPDATE  USING (profile_id = auth.uid());
CREATE POLICY "tasks_delete_own"  ON public.tasks FOR DELETE  USING (profile_id = auth.uid());

CREATE POLICY "tasks_admin_all" ON public.tasks FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE INDEX tasks_profile_status_idx ON public.tasks(profile_id, status);
CREATE INDEX tasks_remind_at_idx      ON public.tasks(remind_at)  WHERE remind_at IS NOT NULL;
CREATE INDEX tasks_due_at_idx         ON public.tasks(due_at)     WHERE due_at    IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tasks_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_set_updated_at();
