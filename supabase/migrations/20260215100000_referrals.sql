-- Referral system migration

-- Create referral status enum
CREATE TYPE referral_status AS ENUM ('pending', 'registered', 'active');

-- Create referrals table
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_email TEXT NOT NULL,
  referred_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  referral_code TEXT NOT NULL,
  status referral_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  registered_at TIMESTAMPTZ
);

-- Indexes for referrals
CREATE INDEX referrals_referrer_id_idx ON referrals(referrer_id);
CREATE INDEX referrals_referral_code_idx ON referrals(referral_code);
CREATE INDEX referrals_referred_email_idx ON referrals(referred_email);
CREATE INDEX referrals_status_idx ON referrals(status);

-- Add referral_code to profiles (default to username)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

-- Populate existing profiles' referral_code from username
UPDATE profiles SET referral_code = username WHERE referral_code IS NULL;

-- Create index on profiles referral_code
CREATE INDEX IF NOT EXISTS profiles_referral_code_idx ON profiles(referral_code);

-- RLS for referrals
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own referrals"
  ON referrals FOR SELECT
  USING (auth.uid() = referrer_id);

CREATE POLICY "Users can insert their own referrals"
  ON referrals FOR INSERT
  WITH CHECK (auth.uid() = referrer_id);

CREATE POLICY "Service role can update referrals"
  ON referrals FOR UPDATE
  USING (true);
