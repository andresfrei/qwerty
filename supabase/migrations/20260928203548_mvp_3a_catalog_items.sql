CREATE TABLE public.catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text,
  price_minor integer NOT NULL CHECK (price_minor >= 0),
  currency text NOT NULL DEFAULT 'ARS'
    CHECK (currency ~ '^[A-Z]{3}$'),
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX catalog_items_business_sort_order_idx
  ON public.catalog_items (business_id, sort_order, id);

ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catalog_items
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.catalog_items
TO anon, authenticated;

GRANT INSERT (business_id, name, description, price_minor, currency, is_available, sort_order),
      UPDATE (name, description, price_minor, currency, is_available, sort_order)
ON TABLE public.catalog_items TO authenticated;

CREATE POLICY "catalog_items_public_select_anon"
ON public.catalog_items
FOR SELECT
TO anon
USING (
  is_available
  AND EXISTS (
    SELECT 1
    FROM public.business_storefronts
    WHERE business_storefronts.business_id = catalog_items.business_id
      AND business_storefronts.is_published
  )
);

CREATE POLICY "catalog_items_public_select_authenticated"
ON public.catalog_items
FOR SELECT
TO authenticated
USING (
  is_available
  AND EXISTS (
    SELECT 1
    FROM public.business_storefronts
    WHERE business_storefronts.business_id = catalog_items.business_id
      AND business_storefronts.is_published
  )
);

CREATE POLICY "catalog_items_owner_select"
ON public.catalog_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = catalog_items.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "catalog_items_owner_insert"
ON public.catalog_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = catalog_items.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "catalog_items_owner_update"
ON public.catalog_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = catalog_items.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = catalog_items.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
);
