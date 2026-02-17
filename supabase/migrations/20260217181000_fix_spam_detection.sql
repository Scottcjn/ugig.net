-- Improved spam detection: add entropy check + fix case-insensitive patterns
CREATE OR REPLACE FUNCTION check_username_spam(uname text, fname text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  lower_uname text;
  letters text;
  vowel_count int;
  char_count int;
  freq int[];
  entropy float;
  c text;
  i int;
  counts int[256];
  p float;
BEGIN
  IF uname IS NULL THEN RETURN false; END IF;
  lower_uname := lower(uname);

  -- Username spam patterns
  IF lower_uname ~ '^[a-z]{2,4}\d{5,}$' THEN RETURN true; END IF;
  IF lower_uname ~ '^user\d{4,}$' THEN RETURN true; END IF;
  IF lower_uname ~ '^[a-z]+_[a-z]+\d{3,}$' THEN RETURN true; END IF;
  IF uname ~ '\d{8,}' THEN RETURN true; END IF;
  IF lower_uname ~ '^[a-z0-9]{20,}$' THEN RETURN true; END IF;
  IF uname ~ '(.)\1{4,}' THEN RETURN true; END IF;
  IF lower_uname ~ '^(buy|sell|cheap|free|promo|discount|crypto|nft|airdrop|casino|poker|viagra|cialis)' THEN RETURN true; END IF;
  IF lower_uname ~ '(seo|marketing|agency|boost|traffic|followers|likes)\d*$' THEN RETURN true; END IF;

  -- Keyboard mash: long string with very few vowels
  letters := lower(regexp_replace(uname, '[^a-zA-Z]', '', 'g'));
  IF length(letters) > 8 THEN
    vowel_count := length(regexp_replace(letters, '[^aeiou]', '', 'g'));
    IF vowel_count::float / length(letters) < 0.1 THEN RETURN true; END IF;
  END IF;

  -- Shannon entropy check: random strings have high entropy
  -- Normal usernames ~3.0-3.5, random strings ~4.0+
  IF length(uname) > 12 THEN
    counts := array_fill(0, ARRAY[256]);
    FOR i IN 1..length(uname) LOOP
      counts[ascii(substr(uname, i, 1)) + 1] := counts[ascii(substr(uname, i, 1)) + 1] + 1;
    END LOOP;
    entropy := 0;
    FOR i IN 1..256 LOOP
      IF counts[i] > 0 THEN
        p := counts[i]::float / length(uname);
        entropy := entropy - p * (ln(p) / ln(2));
      END IF;
    END LOOP;
    IF entropy > 4.0 THEN RETURN true; END IF;
  END IF;

  -- Name spam patterns
  IF fname IS NOT NULL THEN
    IF fname ~ '(.)\1{3,}' THEN RETURN true; END IF;
    IF fname ~ '\d{4,}' THEN RETURN true; END IF;
    IF fname !~ '[a-zA-Z]' THEN RETURN true; END IF;
    IF fname ~* '(http|www\.|\.com|\.net|\.org)' THEN RETURN true; END IF;
    IF fname ~* '^(admin|moderator|support|helpdesk|official)' THEN RETURN true; END IF;
  END IF;

  RETURN false;
END;
$$;

-- Re-backfill with improved detection
UPDATE profiles SET is_spam = check_username_spam(username, full_name);
