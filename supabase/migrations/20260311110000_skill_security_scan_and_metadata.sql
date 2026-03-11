-- Security scanning gate + metadata autofill for skill marketplace
-- ================================================================

-- =============================================
-- ENUMS
-- =============================================

CREATE TYPE skill_scan_status AS ENUM ('pending', 'scanning', 'clean', 'suspicious', 'malicious', 'error', 'timeout');

-- =============================================
-- SKILL SECURITY SCANS TABLE
-- =============================================

CREATE TABLE skill_security_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES skill_listings(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_hash TEXT,                        -- SHA-256 hash of scanned file
  file_size_bytes BIGINT,
  scan_status skill_scan_status NOT NULL DEFAULT 'pending',
  findings_summary JSONB DEFAULT '{}',   -- { risk_level, issues: [...], scanner_version, ... }
  scanned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_skill_scans_listing ON skill_security_scans(listing_id);
CREATE INDEX idx_skill_scans_status ON skill_security_scans(scan_status);

-- RLS
ALTER TABLE skill_security_scans ENABLE ROW LEVEL SECURITY;

-- Sellers can view scans for their own listings
CREATE POLICY "Sellers can view own listing scans"
  ON skill_security_scans FOR SELECT
  USING (
    listing_id IN (
      SELECT id FROM skill_listings WHERE seller_id = auth.uid()
    )
  );

-- Service role handles inserts/updates (scan API uses service client)
CREATE POLICY "Service role manages scans"
  ON skill_security_scans FOR ALL
  USING (true)
  WITH CHECK (true);

-- Auto-update timestamps
CREATE TRIGGER update_skill_scans_updated_at
  BEFORE UPDATE ON skill_security_scans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- ADD COLUMNS TO SKILL LISTINGS
-- =============================================

-- Security scan status cached on listing for quick queries
ALTER TABLE skill_listings ADD COLUMN IF NOT EXISTS scan_status skill_scan_status DEFAULT NULL;

-- Source URL for metadata autofill
ALTER TABLE skill_listings ADD COLUMN IF NOT EXISTS source_url TEXT DEFAULT NULL;

-- Optional logo/image URL from metadata extraction
ALTER TABLE skill_listings ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT NULL;
