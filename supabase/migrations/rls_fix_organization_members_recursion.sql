BEGIN;

CREATE OR REPLACE FUNCTION public.is_org_member(p_org uuid, p_user uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = p_org
      AND m.user_id = p_user
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org uuid, p_user uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = p_org
      AND m.user_id = p_user
      AND m.role IN ('owner','admin')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_org_member(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_org_member(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_org_member(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.is_org_admin(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_org_admin(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_org_admin(uuid, uuid) TO service_role;

DROP POLICY IF EXISTS member_select_self_org ON public.organization_members;
CREATE POLICY member_select_self_org ON public.organization_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_org_admin(organization_members.organization_id, auth.uid())
);

DROP POLICY IF EXISTS member_insert_admin ON public.organization_members;
CREATE POLICY member_insert_admin ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (public.is_org_admin(organization_members.organization_id, auth.uid()));

DROP POLICY IF EXISTS member_update_admin ON public.organization_members;
CREATE POLICY member_update_admin ON public.organization_members
FOR UPDATE
TO authenticated
USING (public.is_org_admin(organization_members.organization_id, auth.uid()))
WITH CHECK (true);

DROP POLICY IF EXISTS member_delete_admin ON public.organization_members;
CREATE POLICY member_delete_admin ON public.organization_members
FOR DELETE
TO authenticated
USING (public.is_org_admin(organization_members.organization_id, auth.uid()));

DROP POLICY IF EXISTS org_select ON public.organizations;
CREATE POLICY org_select ON public.organizations
FOR SELECT
TO authenticated
USING (created_by = auth.uid() OR public.is_org_member(organizations.id, auth.uid()));

DROP POLICY IF EXISTS org_update ON public.organizations;
CREATE POLICY org_update ON public.organizations
FOR UPDATE
TO authenticated
USING (public.is_org_admin(organizations.id, auth.uid()))
WITH CHECK (true);

DROP POLICY IF EXISTS accounts_select ON public.accounts;
CREATE POLICY accounts_select ON public.accounts
FOR SELECT
TO authenticated
USING (public.is_org_member(accounts.organization_id, auth.uid()));

DROP POLICY IF EXISTS accounts_write_admin ON public.accounts;
CREATE POLICY accounts_write_admin ON public.accounts
FOR ALL
TO authenticated
USING (public.is_org_admin(accounts.organization_id, auth.uid()))
WITH CHECK (public.is_org_admin(accounts.organization_id, auth.uid()));

DROP POLICY IF EXISTS contacts_select ON public.contacts;
CREATE POLICY contacts_select ON public.contacts
FOR SELECT
TO authenticated
USING (public.is_org_member(contacts.organization_id, auth.uid()));

DROP POLICY IF EXISTS contacts_write_admin ON public.contacts;
CREATE POLICY contacts_write_admin ON public.contacts
FOR ALL
TO authenticated
USING (public.is_org_admin(contacts.organization_id, auth.uid()))
WITH CHECK (public.is_org_admin(contacts.organization_id, auth.uid()));

DROP POLICY IF EXISTS je_select ON public.journal_entries;
CREATE POLICY je_select ON public.journal_entries
FOR SELECT
TO authenticated
USING (public.is_org_member(journal_entries.organization_id, auth.uid()));

DROP POLICY IF EXISTS je_insert_member ON public.journal_entries;
CREATE POLICY je_insert_member ON public.journal_entries
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND public.is_org_member(journal_entries.organization_id, auth.uid())
);

DROP POLICY IF EXISTS je_update ON public.journal_entries;
CREATE POLICY je_update ON public.journal_entries
FOR UPDATE
TO authenticated
USING (public.is_org_admin(journal_entries.organization_id, auth.uid()) OR (created_by = auth.uid() AND status = 'draft'))
WITH CHECK (true);

DROP POLICY IF EXISTS ji_select ON public.journal_items;
CREATE POLICY ji_select ON public.journal_items
FOR SELECT
TO authenticated
USING (public.is_org_member(journal_items.organization_id, auth.uid()));

DROP POLICY IF EXISTS ji_write ON public.journal_items;
CREATE POLICY ji_write ON public.journal_items
FOR ALL
TO authenticated
USING (
  public.is_org_admin(journal_items.organization_id, auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.id = journal_items.journal_entry_id
      AND je.organization_id = journal_items.organization_id
      AND je.created_by = auth.uid()
      AND je.status = 'draft'
  )
)
WITH CHECK (public.is_org_member(journal_items.organization_id, auth.uid()));

NOTIFY pgrst, 'reload schema';

COMMIT;

