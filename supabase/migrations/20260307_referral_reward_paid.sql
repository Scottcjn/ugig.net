-- Add reward_paid flag to referrals table to prevent double-paying
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS reward_paid boolean DEFAULT false;
