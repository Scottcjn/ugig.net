-- Add auto_pay toggle to affiliate offers
-- When true, conversions are automatically paid after settlement_delay_days
-- When false (default), seller must manually click Pay

ALTER TABLE affiliate_offers ADD COLUMN IF NOT EXISTS auto_pay boolean DEFAULT false;
