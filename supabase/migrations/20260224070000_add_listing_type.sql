-- Add listing_type column to gigs table
ALTER TABLE gigs ADD COLUMN listing_type TEXT NOT NULL DEFAULT 'hiring' CHECK (listing_type IN ('hiring', 'for_hire'));

-- Add index for filtering
CREATE INDEX idx_gigs_listing_type ON gigs (listing_type);
