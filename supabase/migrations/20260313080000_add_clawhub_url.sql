ALTER TABLE skill_listings ADD COLUMN IF NOT EXISTS clawhub_url text;
COMMENT ON COLUMN skill_listings.clawhub_url IS 'Optional link to the skill page on clawhub.ai (e.g. https://clawhub.ai/owner/skill-name)';
