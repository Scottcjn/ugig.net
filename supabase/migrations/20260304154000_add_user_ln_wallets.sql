CREATE TABLE IF NOT EXISTS user_ln_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_id text NOT NULL,
  admin_key text NOT NULL,
  invoice_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE user_ln_wallets ENABLE ROW LEVEL SECURITY;

-- Only service role can access wallet keys
CREATE POLICY "Service role only" ON user_ln_wallets
  FOR ALL USING (false);
