CREATE TABLE public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.business_memberships (
  business_id uuid NOT NULL REFERENCES public.businesses (id),
  user_id uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, user_id)
);

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_memberships ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.businesses, public.business_memberships FROM PUBLIC, anon, authenticated;

GRANT SELECT (id, owner_id, name, created_at),
      INSERT (owner_id, name),
      UPDATE (name)
ON TABLE public.businesses TO authenticated;

CREATE POLICY "businesses_select_owner"
ON public.businesses
FOR SELECT
TO authenticated
USING ((owner_id = (SELECT auth.uid())));

CREATE POLICY "businesses_insert_owner"
ON public.businesses
FOR INSERT
TO authenticated
WITH CHECK ((owner_id = (SELECT auth.uid())));

CREATE POLICY "businesses_update_name_owner"
ON public.businesses
FOR UPDATE
TO authenticated
USING ((owner_id = (SELECT auth.uid())))
WITH CHECK ((owner_id = (SELECT auth.uid())));
