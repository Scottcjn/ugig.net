-- Add is_spam column to profiles for efficient query-time filtering
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_spam boolean NOT NULL DEFAULT false;

-- Function to detect spam usernames using the same patterns as lib/spam-check.ts
CREATE OR REPLACE FUNCTION check_username_spam(uname text, fname text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF uname IS NULL THEN RETURN false; END IF;

  -- Username spam patterns
  IF uname ~* '^[a-z]{2,4}\d{5,}$' THEN RETURN true; END IF;          -- ab12345
  IF uname ~* '^user\d{4,}$' THEN RETURN true; END IF;                  -- user12345
  IF uname ~* '^[a-z]+_[a-z]+\d{3,}$' THEN RETURN true; END IF;        -- first_last123
  IF uname ~ '\d{8,}' THEN RETURN true; END IF;                          -- 8+ consecutive digits
  IF uname ~ '^[a-z0-9]{20,}$' THEN RETURN true; END IF;                -- 20+ random alphanum
  IF uname ~ '(.)\1{4,}' THEN RETURN true; END IF;                       -- 5+ repeated chars
  IF uname ~* '^(buy|sell|cheap|free|promo|discount|crypto|nft|airdrop|casino|poker|viagra|cialis)' THEN RETURN true; END IF;
  IF uname ~* '(seo|marketing|agency|boost|traffic|followers|likes)\d*$' THEN RETURN true; END IF;

  -- Keyboard mash: long string with very few vowels
  IF length(regexp_replace(uname, '[^a-zA-Z]', '', 'g')) > 8 THEN
    DECLARE
      letters text := lower(regexp_replace(uname, '[^a-zA-Z]', '', 'g'));
      vowel_count int := length(regexp_replace(letters, '[^aeiou]', '', 'g'));
    BEGIN
      IF vowel_count::float / length(letters) < 0.1 THEN RETURN true; END IF;
    END;
  END IF;

  -- Name spam patterns (if provided)
  IF fname IS NOT NULL THEN
    IF fname ~ '(.)\1{3,}' THEN RETURN true; END IF;                     -- 4+ repeated chars
    IF fname ~ '\d{4,}' THEN RETURN true; END IF;                        -- 4+ digits in name
    IF fname !~ '[a-zA-Z]' THEN RETURN true; END IF;                     -- no letters at all
    IF fname ~* '(http|www\.|\.com|\.net|\.org)' THEN RETURN true; END IF;
    IF fname ~* '^(admin|moderator|support|helpdesk|official)' THEN RETURN true; END IF;
  END IF;

  RETURN false;
END;
$$;

-- Trigger function to auto-set is_spam on insert/update
CREATE OR REPLACE FUNCTION set_profile_spam_flag()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.is_spam := check_username_spam(NEW.username, NEW.full_name);
  RETURN NEW;
END;
$$;

-- Trigger
DROP TRIGGER IF EXISTS trg_set_spam_flag ON profiles;
CREATE TRIGGER trg_set_spam_flag
  BEFORE INSERT OR UPDATE OF username, full_name ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_profile_spam_flag();

-- Backfill existing rows
UPDATE profiles SET is_spam = check_username_spam(username, full_name);

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_profiles_is_spam ON profiles (is_spam) WHERE is_spam = false;
