-- Prompts Marketplace: listings, purchases, reviews
-- =============================================

-- =============================================
-- ENUMS
-- =============================================

CREATE TYPE prompt_listing_status AS ENUM ('draft', 'active', 'archived');

-- Add prompt-related notification types
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'prompt_purchased';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'prompt_review';

-- =============================================
-- PROMPT LISTINGS TABLE
-- =============================================

CREATE TABLE prompt_listings (
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
  prompt_text TEXT NOT NULL,                      -- the actual prompt content (main asset)
  model_compatibility TEXT[] DEFAULT '{}',        -- which AI models it works with
  example_output TEXT,                            -- sample of what the prompt produces
  use_case TEXT,                                  -- brief description of what it's for
  status prompt_listing_status NOT NULL DEFAULT 'draft',
  downloads_count INTEGER NOT NULL DEFAULT 0,
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  upvotes INTEGER NOT NULL DEFAULT 0,
  downvotes INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT prompt_listings_slug_unique UNIQUE (slug)
);

-- Indexes
CREATE INDEX idx_prompt_listings_seller ON prompt_listings(seller_id);
CREATE INDEX idx_prompt_listings_status ON prompt_listings(status);
CREATE INDEX idx_prompt_listings_category ON prompt_listings(category);
CREATE INDEX idx_prompt_listings_created ON prompt_listings(created_at DESC);
CREATE INDEX idx_prompt_listings_tags ON prompt_listings USING GIN(tags);
CREATE INDEX idx_prompt_listings_search ON prompt_listings
  USING GIN (to_tsvector('english', title || ' ' || coalesce(tagline, '') || ' ' || description));

-- =============================================
-- PROMPT PURCHASES TABLE
-- =============================================

CREATE TABLE prompt_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES prompt_listings(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  price_sats BIGINT NOT NULL,
  fee_sats BIGINT NOT NULL DEFAULT 0,
  fee_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT prompt_purchases_unique UNIQUE (listing_id, buyer_id)
);

-- Indexes
CREATE INDEX idx_prompt_purchases_buyer ON prompt_purchases(buyer_id);
CREATE INDEX idx_prompt_purchases_seller ON prompt_purchases(seller_id);
CREATE INDEX idx_prompt_purchases_listing ON prompt_purchases(listing_id);

-- =============================================
-- PROMPT REVIEWS TABLE
-- =============================================

CREATE TABLE prompt_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES prompt_listings(id) ON DELETE CASCADE,
  purchase_id UUID NOT NULL REFERENCES prompt_purchases(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT prompt_reviews_unique UNIQUE (listing_id, reviewer_id)
);

-- Indexes
CREATE INDEX idx_prompt_reviews_listing ON prompt_reviews(listing_id);
CREATE INDEX idx_prompt_reviews_reviewer ON prompt_reviews(reviewer_id);

-- =============================================
-- PROMPT VOTES TABLE
-- =============================================

CREATE TABLE prompt_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES prompt_listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote_type INTEGER NOT NULL CHECK (vote_type IN (1, -1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT prompt_votes_unique UNIQUE (listing_id, user_id)
);

CREATE INDEX idx_prompt_votes_listing ON prompt_votes(listing_id);
CREATE INDEX idx_prompt_votes_user ON prompt_votes(user_id);

-- =============================================
-- PROMPT COMMENTS TABLE
-- =============================================

CREATE TABLE prompt_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES prompt_listings(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES prompt_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  depth INTEGER NOT NULL DEFAULT 0,
  upvotes INTEGER NOT NULL DEFAULT 0,
  downvotes INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prompt_comments_listing ON prompt_comments(listing_id);
CREATE INDEX idx_prompt_comments_author ON prompt_comments(author_id);
CREATE INDEX idx_prompt_comments_parent ON prompt_comments(parent_id);

-- =============================================
-- RLS POLICIES
-- =============================================

ALTER TABLE prompt_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_comments ENABLE ROW LEVEL SECURITY;

-- prompt_listings: anyone can read active, sellers CRUD own
CREATE POLICY "Active prompt listings are public"
  ON prompt_listings FOR SELECT
  USING (status = 'active' OR seller_id = auth.uid());

CREATE POLICY "Sellers can insert own prompt listings"
  ON prompt_listings FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Sellers can update own prompt listings"
  ON prompt_listings FOR UPDATE
  USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can delete own prompt listings"
  ON prompt_listings FOR DELETE
  USING (auth.uid() = seller_id);

-- prompt_purchases: buyers see own, sellers see own sales
CREATE POLICY "Buyers can view own prompt purchases"
  ON prompt_purchases FOR SELECT
  USING (auth.uid() = buyer_id);

CREATE POLICY "Sellers can view own prompt sales"
  ON prompt_purchases FOR SELECT
  USING (auth.uid() = seller_id);

CREATE POLICY "Service role can insert prompt purchases"
  ON prompt_purchases FOR INSERT
  WITH CHECK (true);

-- prompt_reviews: public read, buyers can write
CREATE POLICY "Prompt reviews are publicly viewable"
  ON prompt_reviews FOR SELECT
  USING (true);

CREATE POLICY "Buyers can create prompt reviews"
  ON prompt_reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY "Reviewers can update own prompt reviews"
  ON prompt_reviews FOR UPDATE
  USING (auth.uid() = reviewer_id);

-- prompt_votes: public read, users can manage own
CREATE POLICY "Prompt votes are publicly viewable"
  ON prompt_votes FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own prompt votes"
  ON prompt_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own prompt votes"
  ON prompt_votes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own prompt votes"
  ON prompt_votes FOR DELETE
  USING (auth.uid() = user_id);

-- prompt_comments: public read, authenticated write
CREATE POLICY "Prompt comments are publicly viewable"
  ON prompt_comments FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own prompt comments"
  ON prompt_comments FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update own prompt comments"
  ON prompt_comments FOR UPDATE
  USING (auth.uid() = author_id);

-- =============================================
-- TRIGGERS
-- =============================================

-- Auto-update timestamps
CREATE TRIGGER update_prompt_listings_updated_at
  BEFORE UPDATE ON prompt_listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_prompt_reviews_updated_at
  BEFORE UPDATE ON prompt_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_prompt_comments_updated_at
  BEFORE UPDATE ON prompt_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update listing rating aggregates on review insert/update/delete
CREATE OR REPLACE FUNCTION update_prompt_listing_rating()
RETURNS TRIGGER AS $$
DECLARE
  _listing_id UUID;
BEGIN
  _listing_id := COALESCE(NEW.listing_id, OLD.listing_id);
  UPDATE prompt_listings SET
    rating_avg = COALESCE((SELECT AVG(rating)::numeric(3,2) FROM prompt_reviews WHERE listing_id = _listing_id), 0),
    rating_count = (SELECT COUNT(*) FROM prompt_reviews WHERE listing_id = _listing_id)
  WHERE id = _listing_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_prompt_review_change
  AFTER INSERT OR UPDATE OR DELETE ON prompt_reviews
  FOR EACH ROW EXECUTE FUNCTION update_prompt_listing_rating();

-- Increment downloads_count on purchase
CREATE OR REPLACE FUNCTION increment_prompt_downloads()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE prompt_listings SET downloads_count = downloads_count + 1 WHERE id = NEW.listing_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_prompt_purchase_created
  AFTER INSERT ON prompt_purchases
  FOR EACH ROW EXECUTE FUNCTION increment_prompt_downloads();

-- Update vote counts on prompt_votes changes
CREATE OR REPLACE FUNCTION update_prompt_listing_votes()
RETURNS TRIGGER AS $$
DECLARE
  _listing_id UUID;
  _up INTEGER;
  _down INTEGER;
BEGIN
  _listing_id := COALESCE(NEW.listing_id, OLD.listing_id);
  SELECT
    COALESCE(SUM(CASE WHEN vote_type = 1 THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN vote_type = -1 THEN 1 ELSE 0 END), 0)
  INTO _up, _down
  FROM prompt_votes WHERE listing_id = _listing_id;

  UPDATE prompt_listings SET
    upvotes = _up,
    downvotes = _down,
    score = _up - _down
  WHERE id = _listing_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_prompt_vote_change
  AFTER INSERT OR UPDATE OR DELETE ON prompt_votes
  FOR EACH ROW EXECUTE FUNCTION update_prompt_listing_votes();

-- =============================================
-- WALLET TRANSACTION TYPE EXTENSION
-- =============================================
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN (
    'deposit', 'withdrawal', 'zap_sent', 'zap_received', 'zap_fee', 'withdrawal_fee',
    'skill_purchase', 'skill_sale', 'skill_sale_fee',
    'mcp_purchase', 'mcp_sale', 'mcp_sale_fee',
    'prompt_purchase', 'prompt_sale', 'prompt_sale_fee'
  ));
