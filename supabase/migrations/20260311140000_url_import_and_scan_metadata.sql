-- URL import pipeline + enriched security scan metadata
-- =====================================================

-- Add content_hash (sha256) to skill_listings for quick reference
ALTER TABLE skill_listings ADD COLUMN IF NOT EXISTS content_hash TEXT DEFAULT NULL;

-- Add scan_source to track where scanned content came from
ALTER TABLE skill_listings ADD COLUMN IF NOT EXISTS scan_source TEXT DEFAULT NULL;

-- Enrich skill_security_scans with import/scan provenance
ALTER TABLE skill_security_scans ADD COLUMN IF NOT EXISTS scan_source TEXT DEFAULT NULL;          -- 'url_import' | 'manual_upload' | 'rescan'
ALTER TABLE skill_security_scans ADD COLUMN IF NOT EXISTS source_url TEXT DEFAULT NULL;            -- the URL fetched (if url import)
ALTER TABLE skill_security_scans ADD COLUMN IF NOT EXISTS content_hash TEXT DEFAULT NULL;          -- sha256 of content at scan time
ALTER TABLE skill_security_scans ADD COLUMN IF NOT EXISTS scanner_version TEXT DEFAULT NULL;       -- e.g. 'secureclaw-0.1.0'
ALTER TABLE skill_security_scans ADD COLUMN IF NOT EXISTS findings_count_by_severity JSONB DEFAULT '{}';  -- { critical: 0, high: 1, ... }

-- Allow public read access to scan records for active listings (trust transparency)
CREATE POLICY "Public can view scans for active listings"
  ON skill_security_scans FOR SELECT
  USING (
    listing_id IN (
      SELECT id FROM skill_listings WHERE status = 'active'
    )
  );
