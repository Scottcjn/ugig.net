-- Add Lightning Address field to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ln_address text;

COMMENT ON COLUMN profiles.ln_address IS 'Lightning Network address (BOLT 11/12) for receiving Bitcoin payments, e.g. user@coinpayportal.com';
