-- Wallet balances
CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  balance_sats bigint NOT NULL DEFAULT 0 CHECK (balance_sats >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Wallet transactions (deposits, withdrawals, zaps sent/received, fees)
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'zap_sent', 'zap_received', 'zap_fee', 'withdrawal_fee')),
  amount_sats bigint NOT NULL,
  balance_after bigint NOT NULL,
  reference_id uuid,
  bolt11 text,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at timestamptz DEFAULT now()
);

-- Zaps
CREATE TABLE IF NOT EXISTS zaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  amount_sats bigint NOT NULL CHECK (amount_sats > 0),
  fee_sats bigint NOT NULL DEFAULT 0,
  target_type text NOT NULL CHECK (target_type IN ('post', 'gig', 'comment')),
  target_id uuid NOT NULL,
  note text,
  created_at timestamptz DEFAULT now()
);

-- Platform wallet (for fee collection)
INSERT INTO wallets (user_id, balance_sats)
VALUES ('00000000-0000-0000-0000-000000000000', 0)
ON CONFLICT (user_id) DO NOTHING;

-- Indexes
CREATE INDEX idx_wallets_user_id ON wallets(user_id);
CREATE INDEX idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX idx_zaps_sender_id ON zaps(sender_id);
CREATE INDEX idx_zaps_recipient_id ON zaps(recipient_id);
CREATE INDEX idx_zaps_target ON zaps(target_type, target_id);

-- RLS
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE zaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wallet" ON wallets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own transactions" ON wallet_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Anyone can view zaps" ON zaps FOR SELECT USING (true);
CREATE POLICY "Users can create zaps" ON zaps FOR INSERT WITH CHECK (auth.uid() = sender_id);
