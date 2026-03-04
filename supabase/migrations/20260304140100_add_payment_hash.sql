ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS payment_hash text;
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_payment_hash ON wallet_transactions(payment_hash);
