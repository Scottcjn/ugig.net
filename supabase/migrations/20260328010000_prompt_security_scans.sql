-- Prompt Security Scans: regex-based content scanning results
-- =============================================

CREATE TABLE prompt_security_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES prompt_listings(id) ON DELETE CASCADE,
  scanner_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  rating TEXT,                    -- F, D, C, B, A, A+
  security_score NUMERIC(4,1),
  findings JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prompt_security_scans_listing ON prompt_security_scans(listing_id);
CREATE INDEX idx_prompt_security_scans_created ON prompt_security_scans(created_at DESC);

ALTER TABLE prompt_security_scans ENABLE ROW LEVEL SECURITY;

-- Anyone can read scan results for listings they can see
CREATE POLICY "prompt_security_scans_select"
  ON prompt_security_scans FOR SELECT
  USING (true);

-- Only the listing owner can insert scans (via service role in practice)
CREATE POLICY "prompt_security_scans_insert"
  ON prompt_security_scans FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM prompt_listings
      WHERE prompt_listings.id = listing_id
        AND prompt_listings.seller_id = auth.uid()
    )
  );

-- Add scan columns to prompt_listings if not present
ALTER TABLE prompt_listings ADD COLUMN IF NOT EXISTS scan_status TEXT DEFAULT 'unscanned';
ALTER TABLE prompt_listings ADD COLUMN IF NOT EXISTS scan_rating TEXT;
