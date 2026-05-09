BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  base_currency char(3) NOT NULL DEFAULT 'THB',
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  role text NOT NULL CHECK (role IN ('owner','admin','member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  normal_balance text NOT NULL CHECK (normal_balance IN ('debit','credit')),
  parent_account_id uuid,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  contact_type text NOT NULL CHECK (contact_type IN ('customer','vendor','both','other')),
  name text NOT NULL,
  tax_id text,
  email text,
  phone text,
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  entry_date date NOT NULL,
  reference_number text,
  memo text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','void')),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  posted_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  journal_entry_id uuid NOT NULL,
  line_no int NOT NULL,
  account_id uuid NOT NULL,
  contact_id uuid,
  description text,
  debit numeric(18,2) NOT NULL DEFAULT 0,
  credit numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (journal_entry_id, line_no),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK ((debit = 0) <> (credit = 0))
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_org_code ON public.accounts(organization_id, code);
CREATE INDEX IF NOT EXISTS idx_contacts_org_name ON public.contacts(organization_id, name);
CREATE INDEX IF NOT EXISTS idx_je_org_date ON public.journal_entries(organization_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_ji_je ON public.journal_items(journal_entry_id, line_no);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_accounts_updated_at ON public.accounts;
CREATE TRIGGER trg_accounts_updated_at
BEFORE UPDATE ON public.accounts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_contacts_updated_at ON public.contacts;
CREATE TRIGGER trg_contacts_updated_at
BEFORE UPDATE ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_journal_entries_updated_at ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_updated_at
BEFORE UPDATE ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_select ON public.organizations;
CREATE POLICY org_select ON public.organizations
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = organizations.id
      AND m.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS org_insert ON public.organizations;
CREATE POLICY org_insert ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS org_update ON public.organizations;
CREATE POLICY org_update ON public.organizations
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = organizations.id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  )
)
WITH CHECK (true);

DROP POLICY IF EXISTS member_select_self_org ON public.organization_members;
CREATE POLICY member_select_self_org ON public.organization_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.organization_members m2
    WHERE m2.organization_id = organization_members.organization_id
      AND m2.user_id = auth.uid()
      AND m2.role IN ('owner','admin')
  )
);

DROP POLICY IF EXISTS member_insert_self ON public.organization_members;
CREATE POLICY member_insert_self ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND role = 'owner');

DROP POLICY IF EXISTS member_insert_admin ON public.organization_members;
CREATE POLICY member_insert_admin ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = organization_members.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  )
);

DROP POLICY IF EXISTS member_update_admin ON public.organization_members;
CREATE POLICY member_update_admin ON public.organization_members
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = organization_members.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  )
)
WITH CHECK (true);

DROP POLICY IF EXISTS member_delete_admin ON public.organization_members;
CREATE POLICY member_delete_admin ON public.organization_members
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = organization_members.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  )
);

DROP POLICY IF EXISTS accounts_select ON public.accounts;
CREATE POLICY accounts_select ON public.accounts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = accounts.organization_id
      AND m.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS accounts_write_admin ON public.accounts;
CREATE POLICY accounts_write_admin ON public.accounts
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = accounts.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = accounts.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  )
);

DROP POLICY IF EXISTS contacts_select ON public.contacts;
CREATE POLICY contacts_select ON public.contacts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = contacts.organization_id
      AND m.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS contacts_write_admin ON public.contacts;
CREATE POLICY contacts_write_admin ON public.contacts
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = contacts.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = contacts.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  )
);

DROP POLICY IF EXISTS je_select ON public.journal_entries;
CREATE POLICY je_select ON public.journal_entries
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = journal_entries.organization_id
      AND m.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS je_insert_member ON public.journal_entries;
CREATE POLICY je_insert_member ON public.journal_entries
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = journal_entries.organization_id
      AND m.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS je_update ON public.journal_entries;
CREATE POLICY je_update ON public.journal_entries
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = journal_entries.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  )
  OR (created_by = auth.uid() AND status = 'draft')
)
WITH CHECK (true);

DROP POLICY IF EXISTS ji_select ON public.journal_items;
CREATE POLICY ji_select ON public.journal_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = journal_items.organization_id
      AND m.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS ji_write ON public.journal_items;
CREATE POLICY ji_write ON public.journal_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = journal_items.organization_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  )
  OR EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.id = journal_items.journal_entry_id
      AND je.organization_id = journal_items.organization_id
      AND je.created_by = auth.uid()
      AND je.status = 'draft'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = journal_items.organization_id
      AND m.user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.create_journal_entry(
  p_organization_id uuid,
  p_entry_date date,
  p_reference_number text,
  p_memo text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_entry_id uuid;
  v_total_debit numeric(18,2) := 0;
  v_total_credit numeric(18,2) := 0;
  v_line jsonb;
  v_line_no int := 0;
  v_debit numeric(18,2);
  v_credit numeric(18,2);
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_members m
    WHERE m.organization_id = p_organization_id
      AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 2 THEN
    RAISE EXCEPTION 'invalid_items';
  END IF;

  INSERT INTO public.journal_entries (organization_id, entry_date, reference_number, memo, status, created_by)
  VALUES (p_organization_id, p_entry_date, NULLIF(p_reference_number, ''), NULLIF(p_memo, ''), 'draft', auth.uid())
  RETURNING id INTO v_entry_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_line_no := v_line_no + 1;
    v_debit := COALESCE(NULLIF(v_line->>'debit', '')::numeric, 0);
    v_credit := COALESCE(NULLIF(v_line->>'credit', '')::numeric, 0);

    INSERT INTO public.journal_items (
      organization_id,
      journal_entry_id,
      line_no,
      account_id,
      contact_id,
      description,
      debit,
      credit
    )
    VALUES (
      p_organization_id,
      v_entry_id,
      v_line_no,
      (v_line->>'account_id')::uuid,
      NULLIF(v_line->>'contact_id', '')::uuid,
      NULLIF(v_line->>'description', ''),
      v_debit,
      v_credit
    );

    v_total_debit := v_total_debit + v_debit;
    v_total_credit := v_total_credit + v_credit;
  END LOOP;

  IF v_total_debit <> v_total_credit THEN
    RAISE EXCEPTION 'unbalanced_entry';
  END IF;

  RETURN v_entry_id;
END;
$$;

REVOKE ALL ON public.organizations FROM anon;
REVOKE ALL ON public.organization_members FROM anon;
REVOKE ALL ON public.accounts FROM anon;
REVOKE ALL ON public.contacts FROM anon;
REVOKE ALL ON public.journal_entries FROM anon;
REVOKE ALL ON public.journal_items FROM anon;

REVOKE ALL ON public.organizations FROM authenticated;
REVOKE ALL ON public.organization_members FROM authenticated;
REVOKE ALL ON public.accounts FROM authenticated;
REVOKE ALL ON public.contacts FROM authenticated;
REVOKE ALL ON public.journal_entries FROM authenticated;
REVOKE ALL ON public.journal_items FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_items TO authenticated;

GRANT ALL ON public.organizations TO service_role;
GRANT ALL ON public.organization_members TO service_role;
GRANT ALL ON public.accounts TO service_role;
GRANT ALL ON public.contacts TO service_role;
GRANT ALL ON public.journal_entries TO service_role;
GRANT ALL ON public.journal_items TO service_role;

REVOKE ALL ON FUNCTION public.create_journal_entry(uuid, date, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.create_journal_entry(uuid, date, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_journal_entry(uuid, date, text, text, jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_journal_entry(uuid, date, text, text, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

