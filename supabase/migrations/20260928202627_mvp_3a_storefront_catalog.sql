CREATE TABLE public.business_storefronts (
  business_id uuid PRIMARY KEY REFERENCES public.businesses (id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
  is_published boolean NOT NULL DEFAULT false,
  CONSTRAINT business_storefronts_slug_safe
    CHECK (slug = lower(slug) AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

ALTER TABLE public.business_storefronts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.business_storefronts
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.business_storefronts
TO anon, authenticated;

GRANT INSERT (business_id, slug, display_name, is_published),
      UPDATE (slug, display_name, is_published)
ON TABLE public.business_storefronts TO authenticated;

CREATE POLICY "business_storefronts_public_select_anon"
ON public.business_storefronts
FOR SELECT
TO anon
USING (is_published);

CREATE POLICY "business_storefronts_public_select_authenticated"
ON public.business_storefronts
FOR SELECT
TO authenticated
USING (is_published);

CREATE POLICY "business_storefronts_owner_select"
ON public.business_storefronts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = business_storefronts.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "business_storefronts_owner_insert"
ON public.business_storefronts
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = business_storefronts.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "business_storefronts_owner_update"
ON public.business_storefronts
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = business_storefronts.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = business_storefronts.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
);
