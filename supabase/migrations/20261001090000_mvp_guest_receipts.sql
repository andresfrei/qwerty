-- SOURCE ONLY. Independent security review MUST precede local application.
-- No dependency on pending product-photo operation grants. No order/account writes.
BEGIN;

CREATE TABLE public.guest_receipts (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  object_path text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'staged' CHECK (state = 'staged'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_receipts_exact_object CHECK (
    object_path = business_id::text || '/' || actor_id::text || '/' || id::text
  )
);
CREATE INDEX guest_receipts_actor_business ON public.guest_receipts(actor_id, business_id);
CREATE INDEX guest_receipts_business ON public.guest_receipts(business_id);
ALTER TABLE public.guest_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.guest_receipts FROM PUBLIC, anon, authenticated, service_role;
-- No sequence, new schema or RPC. Exact new-table privileges are explicit;
-- service_role's platform BYPASSRLS is used only behind server authorization.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.guest_receipts TO service_role;
-- DELETE is reserved for explicitly identified operator test fixtures; the app
-- exposes no deletion/cleanup API. No browser policies, UPDATE or attachment transition.

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('guest-receipts', 'guest-receipts', false, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
-- Restrictive fences protect against even an unrelated permissive Storage
-- policy being introduced later. Anonymous Auth carries authenticated role.
CREATE POLICY guest_receipts_no_browser_objects ON storage.objects
AS RESTRICTIVE FOR ALL TO anon, authenticated
USING (bucket_id <> 'guest-receipts')
WITH CHECK (bucket_id <> 'guest-receipts');
CREATE POLICY guest_receipts_no_browser_bucket_mutation ON storage.buckets
AS RESTRICTIVE FOR ALL TO anon, authenticated
USING (id <> 'guest-receipts')
WITH CHECK (id <> 'guest-receipts');

COMMIT;
