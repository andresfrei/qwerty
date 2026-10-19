CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.owner_email_verified()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = (SELECT auth.uid())
      AND email IS NOT NULL
      AND email_confirmed_at IS NOT NULL
      AND deleted_at IS NULL
  );
$$;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
REVOKE EXECUTE ON FUNCTION private.owner_email_verified() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.owner_email_verified() TO authenticated;

DROP POLICY "businesses_select_owner" ON public.businesses;
CREATE POLICY "businesses_select_owner"
ON public.businesses
FOR SELECT
TO authenticated
USING (
  (owner_id = (SELECT auth.uid()))
  AND (SELECT private.owner_email_verified())
);

DROP POLICY "businesses_insert_owner" ON public.businesses;
CREATE POLICY "businesses_insert_owner"
ON public.businesses
FOR INSERT
TO authenticated
WITH CHECK (
  (owner_id = (SELECT auth.uid()))
  AND (SELECT private.owner_email_verified())
);

DROP POLICY "businesses_update_name_owner" ON public.businesses;
CREATE POLICY "businesses_update_name_owner"
ON public.businesses
FOR UPDATE
TO authenticated
USING (
  (owner_id = (SELECT auth.uid()))
  AND (SELECT private.owner_email_verified())
)
WITH CHECK (
  (owner_id = (SELECT auth.uid()))
  AND (SELECT private.owner_email_verified())
);
