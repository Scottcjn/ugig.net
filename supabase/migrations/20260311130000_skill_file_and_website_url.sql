-- Add skill_file_url and website_url fields to skill_listings
-- ==========================================================

-- Link to the actual skill file (e.g. SKILL.md on GitHub, npm package URL)
ALTER TABLE skill_listings ADD COLUMN IF NOT EXISTS skill_file_url TEXT DEFAULT NULL;

-- Website URL used for metadata autofill (scraping target)
ALTER TABLE skill_listings ADD COLUMN IF NOT EXISTS website_url TEXT DEFAULT NULL;
