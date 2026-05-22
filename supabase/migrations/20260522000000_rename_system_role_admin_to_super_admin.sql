-- Rename system role 'admin' → 'super_admin' in profiles table
-- Org-level roles in organization_members are unaffected.

-- 1. Drop existing check constraint on profiles.role
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 2. Migrate existing data (must happen before adding new constraint)
UPDATE public.profiles SET role = 'super_admin' WHERE role = 'admin';

-- 3. Add updated constraint
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('super_admin', 'user'));

-- 4. Update RLS policy on org_module_settings (checks profiles.role)
DROP POLICY IF EXISTS "Admin can manage org module settings" ON public.org_module_settings;
CREATE POLICY "Admin can manage org module settings"
  ON public.org_module_settings FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- 5. Update RLS policy on tasks (checks profiles.role)
DROP POLICY IF EXISTS "Admins can access all tasks" ON public.tasks;
CREATE POLICY "Admins can access all tasks"
  ON public.tasks FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
