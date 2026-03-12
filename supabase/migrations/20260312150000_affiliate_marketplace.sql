-- Affiliate Marketplace: offers, affiliates, clicks, conversions, commissions
-- Modeled after skill_marketplace pattern — sats-based wallet ledger
-- =============================================

-- =============================================
-- ENUMS
-- =============================================

CREATE TYPE affiliate_offer_status AS ENUM ('draft', 'active', 'paused', 'archived');
CREATE TYPE affiliate_application_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE commission_status AS ENUM ('pending', 'approved', 'paid', 'clawed_back');

-- Add affiliate notification types
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'affiliate_application';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'affiliate_approved';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'affiliate_rejected';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'affiliate_sale';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'affiliate_commission_paid';

-- =============================================
-- AFFILIATE OFFERS TABLE
-- =============================================

CREATE TABLE affiliate_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Optional link to a skill listing (can also be standalone)
  listing_id UUID REFERENCES skill_listings(id) ON DELETE SET NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- Product info
  product_url TEXT,                     -- where buyers land
  product_type TEXT NOT NULL DEFAULT 'digital',  -- digital, saas, course, service, other
  price_sats BIGINT NOT NULL DEFAULT 0 CHECK (price_sats >= 0),
  -- Commission config
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.20,  -- 20% default
  commission_type TEXT NOT NULL DEFAULT 'percentage',   -- percentage or flat
  commission_flat_sats BIGINT DEFAULT 0,               -- used when type=flat
  cookie_days INTEGER NOT NULL DEFAULT 30,              -- attribution window
  -- Settlement
  settlement_delay_days INTEGER NOT NULL DEFAULT 7,     -- hold before payout
  -- Promo materials
  promo_text TEXT,
  promo_images TEXT[] DEFAULT '{}',
  -- Metrics (denormalized for speed)
  total_affiliates INTEGER NOT NULL DEFAULT 0,
  total_clicks BIGINT NOT NULL DEFAULT 0,
  total_conversions BIGINT NOT NULL DEFAULT 0,
  total_revenue_sats BIGINT NOT NULL DEFAULT 0,
  total_commissions_sats BIGINT NOT NULL DEFAULT 0,
  -- Status & meta
  status affiliate_offer_status NOT NULL DEFAULT 'active',
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT affiliate_offers_slug_unique UNIQUE (slug)
);

CREATE INDEX idx_affiliate_offers_seller ON affiliate_offers(seller_id);
CREATE INDEX idx_affiliate_offers_listing ON affiliate_offers(listing_id);
CREATE INDEX idx_affiliate_offers_status ON affiliate_offers(status);
CREATE INDEX idx_affiliate_offers_category ON affiliate_offers(category);
CREATE INDEX idx_affiliate_offers_created ON affiliate_offers(created_at DESC);
CREATE INDEX idx_affiliate_offers_tags ON affiliate_offers USING GIN(tags);

-- =============================================
-- AFFILIATE APPLICATIONS (join an offer)
-- =============================================

CREATE TABLE affiliate_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES affiliate_offers(id) ON DELETE CASCADE,
  affiliate_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status affiliate_application_status NOT NULL DEFAULT 'pending',
  -- Unique tracking code for this affiliate+offer pair
  tracking_code TEXT NOT NULL,
  note TEXT,                            -- affiliate's pitch to the seller
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT affiliate_applications_unique UNIQUE (offer_id, affiliate_id),
  CONSTRAINT affiliate_applications_tracking_unique UNIQUE (tracking_code)
);

CREATE INDEX idx_affiliate_apps_offer ON affiliate_applications(offer_id);
CREATE INDEX idx_affiliate_apps_affiliate ON affiliate_applications(affiliate_id);
CREATE INDEX idx_affiliate_apps_status ON affiliate_applications(status);
CREATE INDEX idx_affiliate_apps_tracking ON affiliate_applications(tracking_code);

-- =============================================
-- AFFILIATE CLICKS (tracking)
-- =============================================

CREATE TABLE affiliate_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES affiliate_offers(id) ON DELETE CASCADE,
  affiliate_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tracking_code TEXT NOT NULL,
  -- Visitor info
  visitor_id TEXT,                      -- anonymous cookie/fingerprint
  ip_hash TEXT,                         -- hashed IP for dedup
  user_agent TEXT,
  referer TEXT,
  -- Attribution
  landed_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_affiliate_clicks_offer ON affiliate_clicks(offer_id);
CREATE INDEX idx_affiliate_clicks_affiliate ON affiliate_clicks(affiliate_id);
CREATE INDEX idx_affiliate_clicks_tracking ON affiliate_clicks(tracking_code);
CREATE INDEX idx_affiliate_clicks_visitor ON affiliate_clicks(visitor_id);
CREATE INDEX idx_affiliate_clicks_created ON affiliate_clicks(created_at DESC);

-- =============================================
-- AFFILIATE CONVERSIONS (sales attributed to affiliates)
-- =============================================

CREATE TABLE affiliate_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES affiliate_offers(id) ON DELETE CASCADE,
  affiliate_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  click_id UUID REFERENCES affiliate_clicks(id) ON DELETE SET NULL,
  buyer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- Purchase reference (skill purchase or standalone)
  purchase_id UUID,                     -- skill_purchases.id if from skill marketplace
  -- Amounts
  sale_amount_sats BIGINT NOT NULL,
  commission_sats BIGINT NOT NULL,
  -- Status
  status commission_status NOT NULL DEFAULT 'pending',
  settles_at TIMESTAMPTZ NOT NULL,      -- when commission becomes payable
  paid_at TIMESTAMPTZ,
  clawed_back_at TIMESTAMPTZ,
  clawback_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_affiliate_conversions_offer ON affiliate_conversions(offer_id);
CREATE INDEX idx_affiliate_conversions_affiliate ON affiliate_conversions(affiliate_id);
CREATE INDEX idx_affiliate_conversions_status ON affiliate_conversions(status);
CREATE INDEX idx_affiliate_conversions_settles ON affiliate_conversions(settles_at);
CREATE INDEX idx_affiliate_conversions_buyer ON affiliate_conversions(buyer_id);

-- =============================================
-- RLS POLICIES
-- =============================================

ALTER TABLE affiliate_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_conversions ENABLE ROW LEVEL SECURITY;

-- Offers: anyone can read active, sellers manage their own
CREATE POLICY "Anyone can view active offers" ON affiliate_offers
  FOR SELECT USING (status = 'active');
CREATE POLICY "Sellers manage own offers" ON affiliate_offers
  FOR ALL USING (seller_id = auth.uid());

-- Applications: affiliates see their own, sellers see apps for their offers
CREATE POLICY "Affiliates see own applications" ON affiliate_applications
  FOR SELECT USING (affiliate_id = auth.uid());
CREATE POLICY "Sellers see applications for own offers" ON affiliate_applications
  FOR SELECT USING (
    offer_id IN (SELECT id FROM affiliate_offers WHERE seller_id = auth.uid())
  );
CREATE POLICY "Affiliates create applications" ON affiliate_applications
  FOR INSERT WITH CHECK (affiliate_id = auth.uid());

-- Clicks: insert via service role only, affiliates see own
CREATE POLICY "Affiliates see own clicks" ON affiliate_clicks
  FOR SELECT USING (affiliate_id = auth.uid());

-- Conversions: affiliates see own, sellers see for their offers
CREATE POLICY "Affiliates see own conversions" ON affiliate_conversions
  FOR SELECT USING (affiliate_id = auth.uid());
CREATE POLICY "Sellers see conversions for own offers" ON affiliate_conversions
  FOR SELECT USING (
    offer_id IN (SELECT id FROM affiliate_offers WHERE seller_id = auth.uid())
  );
