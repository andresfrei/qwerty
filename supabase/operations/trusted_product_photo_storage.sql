-- Trusted product photo storage operation source.
--
-- This is intentionally not a migration. The native deployment history/version mapping
-- is selected later, against the one existing Supabase project used through the MVP.
-- Keep this operation separate from the already-deployed photo-column ALTER.
--
-- The whole operation is one DO statement so function creation, privilege hardening,
-- and bucket creation commit together. PostgreSQL provider schema/history bookkeeping
-- is not claimed to be jointly atomic with this statement.

DO $operation$
BEGIN
  EXECUTE $sql$
    CREATE FUNCTION public.get_owned_product_photo(
      p_actor_id uuid,
      p_item_id uuid
    )
    RETURNS TABLE (
      business_id uuid,
      photo_version text
    )
    LANGUAGE sql
    STABLE
    SECURITY INVOKER
    SET search_path = ''
    AS $fn$
      SELECT
        ci.business_id,
        ci.photo_version::text
      FROM public.catalog_items AS ci
      JOIN public.businesses AS b
        ON b.id = ci.business_id
      WHERE b.owner_id = p_actor_id
        AND ci.id = p_item_id
    $fn$
  $sql$;

  EXECUTE $sql$
    CREATE FUNCTION public.commit_product_photo(
      p_actor_id uuid,
      p_item_id uuid,
      p_business_id uuid,
      p_expected_version text,
      p_next_version text,
      p_photo_path text
    )
    RETURNS boolean
    LANGUAGE plpgsql
    VOLATILE
    SECURITY INVOKER
    SET search_path = ''
    AS $fn$
    DECLARE
      v_expected_version bigint;
      v_next_version bigint;
      v_owned_business_id uuid;
      v_updated_rows integer;
    BEGIN
      IF p_actor_id IS NULL
         OR p_item_id IS NULL
         OR p_business_id IS NULL
         OR p_expected_version IS NULL
         OR p_next_version IS NULL THEN
        RETURN false;
      END IF;

      -- Keep lexical and length validation cast-free. This block must reject
      -- malformed values before any numeric expression can be evaluated.
      IF p_expected_version !~ '^(0|[1-9][0-9]*)$'
         OR length(p_expected_version) > 19
         OR p_next_version !~ '^(0|[1-9][0-9]*)$'
         OR length(p_next_version) > 19 THEN
        RETURN false;
      END IF;

      -- Both values are now canonical decimal strings of at most 19 digits, so
      -- the numeric upper-bound casts below cannot receive malformed input.
      IF (length(p_expected_version) = 19
          AND p_expected_version::numeric > 9223372036854775807::numeric)
         OR (length(p_next_version) = 19
             AND p_next_version::numeric > 9223372036854775807::numeric) THEN
        RETURN false;
      END IF;

      v_expected_version := p_expected_version::bigint;
      v_next_version := p_next_version::bigint;

      -- Reject the maximum before evaluating successor arithmetic.
      IF v_expected_version = 9223372036854775807::bigint THEN
        RETURN false;
      END IF;

      IF v_next_version <> v_expected_version + 1 THEN
        RETURN false;
      END IF;

      IF p_photo_path IS NOT NULL
         AND p_photo_path !~ (
           '^' || p_business_id::text || '/' || p_item_id::text ||
           '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]webp$'
         ) THEN
        RETURN false;
      END IF;

      -- FOR SHARE conflicts with an ownership UPDATE. This lock must be held
      -- before the catalog CAS so a privileged owner change cannot race the check.
      SELECT b.id
        INTO v_owned_business_id
      FROM public.businesses AS b
      WHERE b.id = p_business_id
        AND b.owner_id = p_actor_id
      FOR SHARE;

      IF NOT FOUND THEN
        RETURN false;
      END IF;

      UPDATE public.catalog_items AS ci
      SET photo_path = p_photo_path,
          photo_version = v_next_version
      WHERE ci.id = p_item_id
        AND ci.business_id = v_owned_business_id
        AND ci.photo_version = v_expected_version;

      GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
      RETURN v_updated_rows = 1;
    END
    $fn$
  $sql$;

  EXECUTE $sql$
    REVOKE EXECUTE ON FUNCTION public.get_owned_product_photo(uuid, uuid)
      FROM PUBLIC, anon, authenticated
  $sql$;

  EXECUTE $sql$
    REVOKE EXECUTE ON FUNCTION public.commit_product_photo(uuid, uuid, uuid, text, text, text)
      FROM PUBLIC, anon, authenticated
  $sql$;

  EXECUTE $sql$
    GRANT EXECUTE ON FUNCTION public.get_owned_product_photo(uuid, uuid)
      TO service_role
  $sql$;

  EXECUTE $sql$
    GRANT EXECUTE ON FUNCTION public.commit_product_photo(uuid, uuid, uuid, text, text, text)
      TO service_role
  $sql$;

  EXECUTE $sql$
    INSERT INTO storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    )
    VALUES (
      'product-photos',
      'product-photos',
      true,
      409600,
      ARRAY['image/webp']::text[]
    )
  $sql$;
END
$operation$;
