-- Port d0rz CoinPay funding flow into ugig.net.
-- Adds CoinPay-specific columns to funding_payments and loosens the
-- Lightning-only constraints so crypto and Stripe-routed card payments
-- can live in the same table.

-- Drop the strict status check (was: pending/paid/expired)
ALTER TABLE funding_payments DROP CONSTRAINT IF EXISTS funding_payments_status_check;
ALTER TABLE funding_payments
  ADD CONSTRAINT funding_payments_status_check
  CHECK (status IN ('pending','paid','confirmed','forwarded','expired','failed','refunded'));

-- Drop the tier whitelist; allow null tier or 'card'/'crypto' style values
ALTER TABLE funding_payments DROP CONSTRAINT IF EXISTS funding_payments_tier_check;
ALTER TABLE funding_payments ALTER COLUMN tier DROP NOT NULL;

-- Lightning-only columns become optional
ALTER TABLE funding_payments ALTER COLUMN payment_hash DROP NOT NULL;
ALTER TABLE funding_payments ALTER COLUMN bolt11 DROP NOT NULL;
ALTER TABLE funding_payments ALTER COLUMN amount_sats DROP NOT NULL;
ALTER TABLE funding_payments ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE funding_payments ALTER COLUMN user_id DROP NOT NULL;

-- New CoinPay columns
ALTER TABLE funding_payments ADD COLUMN IF NOT EXISTS coinpay_payment_id text;
ALTER TABLE funding_payments ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE funding_payments ADD COLUMN IF NOT EXISTS amount_crypto numeric(36,18);
ALTER TABLE funding_payments ADD COLUMN IF NOT EXISTS contributor_name text;
ALTER TABLE funding_payments ADD COLUMN IF NOT EXISTS contributor_email text;
ALTER TABLE funding_payments ADD COLUMN IF NOT EXISTS tx_hash text;
ALTER TABLE funding_payments ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_funding_payments_coinpay_payment_id
  ON funding_payments(coinpay_payment_id)
  WHERE coinpay_payment_id IS NOT NULL;

-- Allow anonymous inserts (funding is public). Service role still does the writes.
DROP POLICY IF EXISTS "Users can create own funding payments" ON funding_payments;
CREATE POLICY "Anyone can create funding payments"
  ON funding_payments FOR INSERT
  WITH CHECK (true);

-- Public read for the contributors/total endpoints (only paid/forwarded rows
-- are exposed by the API, but RLS just gates the table — the API filters).
DROP POLICY IF EXISTS "Users can view own funding payments" ON funding_payments;
CREATE POLICY "Public can view funding payments"
  ON funding_payments FOR SELECT
  USING (true);
