CREATE TABLE public.catalog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_categories_business_id_id_key UNIQUE (business_id, id)
);

CREATE INDEX catalog_categories_business_sort_order_idx
  ON public.catalog_categories (business_id, sort_order, id);

ALTER TABLE public.catalog_items
  ADD COLUMN category_id uuid;

INSERT INTO public.catalog_categories (business_id, name, sort_order)
SELECT DISTINCT business_id, 'General', 0
FROM public.catalog_items;

UPDATE public.catalog_items AS items
SET category_id = categories.id
FROM public.catalog_categories AS categories
WHERE categories.business_id = items.business_id
  AND categories.name = 'General';

ALTER TABLE public.catalog_items
  ALTER COLUMN category_id SET NOT NULL,
  ADD CONSTRAINT catalog_items_business_category_fk
    FOREIGN KEY (business_id, category_id)
    REFERENCES public.catalog_categories (business_id, id);

CREATE INDEX catalog_items_business_category_sort_order_idx
  ON public.catalog_items (business_id, category_id, sort_order, id);

ALTER TABLE public.catalog_categories ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catalog_categories
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.catalog_categories
TO anon, authenticated;

GRANT INSERT (business_id, name, sort_order),
      UPDATE (name, sort_order)
ON TABLE public.catalog_categories TO authenticated;

CREATE POLICY "catalog_categories_public_select_anon"
ON public.catalog_categories
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.business_storefronts
    WHERE business_storefronts.business_id = catalog_categories.business_id
      AND business_storefronts.is_published
  )
);

CREATE POLICY "catalog_categories_public_select_authenticated"
ON public.catalog_categories
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.business_storefronts
    WHERE business_storefronts.business_id = catalog_categories.business_id
      AND business_storefronts.is_published
  )
);

CREATE POLICY "catalog_categories_owner_select"
ON public.catalog_categories
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = catalog_categories.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "catalog_categories_owner_insert"
ON public.catalog_categories
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = catalog_categories.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
);

CREATE POLICY "catalog_categories_owner_update"
ON public.catalog_categories
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = catalog_categories.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = catalog_categories.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
);

GRANT INSERT (business_id, category_id, name, description, price_minor, currency, is_available, sort_order),
      UPDATE (category_id)
ON TABLE public.catalog_items TO authenticated;
