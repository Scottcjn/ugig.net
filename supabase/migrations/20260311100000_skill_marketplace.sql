-- Skill Marketplace MVP: listings, purchases, reviews
-- =============================================

-- =============================================
-- ENUMS
-- =============================================

CREATE TYPE skill_listing_status AS ENUM ('draft', 'active', 'archived');

-- Add skill-related notification types
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'skill_purchased';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'skill_review';

-- =============================================
-- SKILL LISTINGS TABLE
-- =============================================

CREATE TABLE skill_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  tagline TEXT,
  description TEXT NOT NULL DEFAULT '',
  price_sats BIGINT NOT NULL DEFAULT 0 CHECK (price_sats >= 0),
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  cover_image_url TEXT,
  skill_file_path TEXT,                 -- storage path within 'skills' bucket
  status skill_listing_status NOT NULL DEFAULT 'draft',
  downloads_count INTEGER NOT NULL DEFAULT 0,
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT skill_listings_slug_unique UNIQUE (slug)
);

-- Indexes
CREATE INDEX idx_skill_listings_seller ON skill_listings(seller_id);
CREATE INDEX idx_skill_listings_status ON skill_listings(status);
CREATE INDEX idx_skill_listings_category ON skill_listings(category);
CREATE INDEX idx_skill_listings_created ON skill_listings(created_at DESC);
CREATE INDEX idx_skill_listings_tags ON skill_listings USING GIN(tags);
CREATE INDEX idx_skill_listings_search ON skill_listings
  USING GIN (to_tsvector('english', title || ' ' || coalesce(tagline, '') || ' ' || description));

-- =============================================
-- SKILL PURCHASES TABLE
-- =============================================

CREATE TABLE skill_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES skill_listings(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  price_sats BIGINT NOT NULL,
  fee_sats BIGINT NOT NULL DEFAULT 0,
  fee_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT skill_purchases_unique UNIQUE (listing_id, buyer_id)
);

-- Indexes
CREATE INDEX idx_skill_purchases_buyer ON skill_purchases(buyer_id);
CREATE INDEX idx_skill_purchases_seller ON skill_purchases(seller_id);
CREATE INDEX idx_skill_purchases_listing ON skill_purchases(listing_id);

-- =============================================
-- SKILL REVIEWS TABLE
-- =============================================

CREATE TABLE skill_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES skill_listings(id) ON DELETE CASCADE,
  purchase_id UUID NOT NULL REFERENCES skill_purchases(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT skill_reviews_unique UNIQUE (listing_id, reviewer_id)
);

-- Indexes
CREATE INDEX idx_skill_reviews_listing ON skill_reviews(listing_id);
CREATE INDEX idx_skill_reviews_reviewer ON skill_reviews(reviewer_id);

-- =============================================
-- RLS POLICIES
-- =============================================

ALTER TABLE skill_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_reviews ENABLE ROW LEVEL SECURITY;

-- skill_listings: anyone can read active, sellers CRUD own
CREATE POLICY "Active skill listings are public"
  ON skill_listings FOR SELECT
  USING (status = 'active' OR seller_id = auth.uid());

CREATE POLICY "Sellers can insert own listings"
  ON skill_listings FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Sellers can update own listings"
  ON skill_listings FOR UPDATE
  USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can delete own listings"
  ON skill_listings FOR DELETE
  USING (auth.uid() = seller_id);

-- skill_purchases: buyers see own, sellers see own sales
CREATE POLICY "Buyers can view own purchases"
  ON skill_purchases FOR SELECT
  USING (auth.uid() = buyer_id);

CREATE POLICY "Sellers can view own sales"
  ON skill_purchases FOR SELECT
  USING (auth.uid() = seller_id);

-- Service role inserts purchases (purchase API uses service client)
CREATE POLICY "Service role can insert purchases"
  ON skill_purchases FOR INSERT
  WITH CHECK (true);  -- gated by service role key in API

-- skill_reviews: public read, buyers can write
CREATE POLICY "Reviews are publicly viewable"
  ON skill_reviews FOR SELECT
  USING (true);

CREATE POLICY "Buyers can create reviews"
  ON skill_reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY "Reviewers can update own reviews"
  ON skill_reviews FOR UPDATE
  USING (auth.uid() = reviewer_id);

-- =============================================
-- TRIGGERS
-- =============================================

-- Auto-update timestamps
CREATE TRIGGER update_skill_listings_updated_at
  BEFORE UPDATE ON skill_listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_skill_reviews_updated_at
  BEFORE UPDATE ON skill_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update listing rating aggregates on review insert/update/delete
CREATE OR REPLACE FUNCTION update_skill_listing_rating()
RETURNS TRIGGER AS $$
DECLARE
  _listing_id UUID;
BEGIN
  _listing_id := COALESCE(NEW.listing_id, OLD.listing_id);
  UPDATE skill_listings SET
    rating_avg = COALESCE((SELECT AVG(rating)::numeric(3,2) FROM skill_reviews WHERE listing_id = _listing_id), 0),
    rating_count = (SELECT COUNT(*) FROM skill_reviews WHERE listing_id = _listing_id)
  WHERE id = _listing_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_skill_review_change
  AFTER INSERT OR UPDATE OR DELETE ON skill_reviews
  FOR EACH ROW EXECUTE FUNCTION update_skill_listing_rating();

-- Increment downloads_count on purchase
CREATE OR REPLACE FUNCTION increment_skill_downloads()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE skill_listings SET downloads_count = downloads_count + 1 WHERE id = NEW.listing_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_skill_purchase_created
  AFTER INSERT ON skill_purchases
  FOR EACH ROW EXECUTE FUNCTION increment_skill_downloads();

-- =============================================
-- STORAGE BUCKET (placeholder — create via dashboard or CLI)
-- =============================================
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('skills', 'skills', false)
-- ON CONFLICT (id) DO NOTHING;
--
-- Policies:
-- * Sellers can upload to skills/{seller_id}/*
-- * Buyers who purchased can read the file
-- * Cover images stored in a public sub-path
-- (Implemented in application code via signed URLs for now)

-- =============================================
-- WALLET TRANSACTION TYPE EXTENSION
-- =============================================
-- The existing wallet_transactions.type CHECK allows specific values.
-- Add new types for skill purchases:
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN (
    'deposit', 'withdrawal', 'zap_sent', 'zap_received', 'zap_fee', 'withdrawal_fee',
    'skill_purchase', 'skill_sale', 'skill_sale_fee'
  ));
