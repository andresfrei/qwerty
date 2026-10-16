CREATE TABLE public.business_catalog_settings (
  business_id uuid PRIMARY KEY REFERENCES public.businesses (id) ON DELETE CASCADE,
  two_flavor_surcharge_minor integer NOT NULL DEFAULT 0
    CHECK (two_flavor_surcharge_minor >= 0)
);

ALTER TABLE public.catalog_items
  ADD CONSTRAINT catalog_items_business_id_id_key UNIQUE (business_id, id);

CREATE TABLE public.catalog_option_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses (id) ON DELETE CASCADE,
  item_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  selection_mode text NOT NULL
    CHECK (selection_mode IN ('distinct', 'quantity')),
  min_select integer NOT NULL CHECK (min_select >= 0),
  max_select integer NOT NULL CHECK (max_select >= min_select),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  CONSTRAINT catalog_option_groups_business_id_id_key UNIQUE (business_id, id),
  CONSTRAINT catalog_option_groups_business_item_fk
    FOREIGN KEY (business_id, item_id)
    REFERENCES public.catalog_items (business_id, id)
);

CREATE INDEX catalog_option_groups_business_item_sort_order_idx
  ON public.catalog_option_groups (business_id, item_id, sort_order, id);

CREATE TABLE public.catalog_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  group_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  price_delta_minor integer NOT NULL DEFAULT 0 CHECK (price_delta_minor >= 0),
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  CONSTRAINT catalog_options_business_id_id_key UNIQUE (business_id, id),
  CONSTRAINT catalog_options_business_group_fk
    FOREIGN KEY (business_id, group_id)
    REFERENCES public.catalog_option_groups (business_id, id)
    ON DELETE CASCADE
);

CREATE INDEX catalog_options_business_group_sort_order_idx
  ON public.catalog_options (business_id, group_id, sort_order, id);

ALTER TABLE public.business_catalog_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_options ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.business_catalog_settings
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.business_catalog_settings
TO anon, authenticated;

GRANT INSERT (business_id, two_flavor_surcharge_minor),
      UPDATE (two_flavor_surcharge_minor)
ON TABLE public.business_catalog_settings TO authenticated;

REVOKE ALL ON TABLE public.catalog_option_groups
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.catalog_option_groups
TO anon, authenticated;

GRANT INSERT (business_id, item_id, name, selection_mode, min_select, max_select, sort_order),
      UPDATE (item_id, name, selection_mode, min_select, max_select, sort_order)
ON TABLE public.catalog_option_groups TO authenticated;

REVOKE ALL ON TABLE public.catalog_options
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.catalog_options
TO anon, authenticated;

GRANT INSERT (business_id, group_id, name, price_delta_minor, is_available, sort_order),
      UPDATE (group_id, name, price_delta_minor, is_available, sort_order)
ON TABLE public.catalog_options TO authenticated;

CREATE POLICY "business_catalog_settings_public_select_anon"
ON public.business_catalog_settings
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.business_storefronts
    WHERE business_storefronts.business_id = business_catalog_settings.business_id
      AND business_storefronts.is_published
  )
);

CREATE POLICY "business_catalog_settings_public_select_authenticated"
ON public.business_catalog_settings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.business_storefronts
    WHERE business_storefronts.business_id = business_catalog_settings.business_id
      AND business_storefronts.is_published
  )
);

CREATE POLICY "business_catalog_settings_owner_select"
ON public.business_catalog_settings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = business_catalog_settings.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
  AND (SELECT private.owner_email_verified())
);

CREATE POLICY "business_catalog_settings_owner_insert"
ON public.business_catalog_settings
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = business_catalog_settings.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
  AND (SELECT private.owner_email_verified())
);

CREATE POLICY "business_catalog_settings_owner_update"
ON public.business_catalog_settings
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = business_catalog_settings.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
  AND (SELECT private.owner_email_verified())
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = business_catalog_settings.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
  AND (SELECT private.owner_email_verified())
);

CREATE POLICY "catalog_option_groups_public_select_anon"
ON public.catalog_option_groups
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.catalog_items
    JOIN public.business_storefronts
      ON business_storefronts.business_id = catalog_items.business_id
    WHERE catalog_items.id = catalog_option_groups.item_id
      AND catalog_items.business_id = catalog_option_groups.business_id
      AND catalog_items.is_available
      AND business_storefronts.is_published
  )
);

CREATE POLICY "catalog_option_groups_public_select_authenticated"
ON public.catalog_option_groups
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.catalog_items
    JOIN public.business_storefronts
      ON business_storefronts.business_id = catalog_items.business_id
    WHERE catalog_items.id = catalog_option_groups.item_id
      AND catalog_items.business_id = catalog_option_groups.business_id
      AND catalog_items.is_available
      AND business_storefronts.is_published
  )
);

CREATE POLICY "catalog_option_groups_owner_select"
ON public.catalog_option_groups
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = catalog_option_groups.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
  AND (SELECT private.owner_email_verified())
);

CREATE POLICY "catalog_option_groups_owner_insert"
ON public.catalog_option_groups
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = catalog_option_groups.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
  AND (SELECT private.owner_email_verified())
);

CREATE POLICY "catalog_option_groups_owner_update"
ON public.catalog_option_groups
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = catalog_option_groups.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
  AND (SELECT private.owner_email_verified())
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = catalog_option_groups.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
  AND (SELECT private.owner_email_verified())
);

CREATE POLICY "catalog_options_public_select_anon"
ON public.catalog_options
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1
    FROM public.catalog_option_groups
    JOIN public.catalog_items
      ON catalog_items.id = catalog_option_groups.item_id
     AND catalog_items.business_id = catalog_option_groups.business_id
    JOIN public.business_storefronts
      ON business_storefronts.business_id = catalog_items.business_id
    WHERE catalog_option_groups.id = catalog_options.group_id
      AND catalog_option_groups.business_id = catalog_options.business_id
      AND catalog_items.is_available
      AND business_storefronts.is_published
  )
);

CREATE POLICY "catalog_options_public_select_authenticated"
ON public.catalog_options
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.catalog_option_groups
    JOIN public.catalog_items
      ON catalog_items.id = catalog_option_groups.item_id
     AND catalog_items.business_id = catalog_option_groups.business_id
    JOIN public.business_storefronts
      ON business_storefronts.business_id = catalog_items.business_id
    WHERE catalog_option_groups.id = catalog_options.group_id
      AND catalog_option_groups.business_id = catalog_options.business_id
      AND catalog_items.is_available
      AND business_storefronts.is_published
  )
);

CREATE POLICY "catalog_options_owner_select"
ON public.catalog_options
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = catalog_options.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
  AND (SELECT private.owner_email_verified())
);

CREATE POLICY "catalog_options_owner_insert"
ON public.catalog_options
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = catalog_options.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
  AND (SELECT private.owner_email_verified())
);

CREATE POLICY "catalog_options_owner_update"
ON public.catalog_options
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = catalog_options.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
  AND (SELECT private.owner_email_verified())
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.businesses
    WHERE businesses.id = catalog_options.business_id
      AND businesses.owner_id = (SELECT auth.uid())
  )
  AND (SELECT private.owner_email_verified())
);
