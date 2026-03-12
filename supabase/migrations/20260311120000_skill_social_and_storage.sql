-- Skill marketplace: social interactions (votes, comments) + storage bucket + zap support
-- =======================================================================================

-- =============================================
-- STORAGE BUCKET: skill-files (private)
-- =============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'skill-files',
  'skill-files',
  false,
  52428800,  -- 50 MB
  NULL       -- allow any MIME; security scanner gates upload
)
ON CONFLICT (id) DO NOTHING;

-- Sellers can upload to their own folder: skill-files/{seller_id}/*
CREATE POLICY "Sellers upload own skill files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'skill-files'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );

-- Sellers can overwrite their own files
CREATE POLICY "Sellers update own skill files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'skill-files'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );

-- No public SELECT — downloads go through signed URLs via service role

-- =============================================
-- SKILL VOTES TABLE (upvote/downvote, matching posts pattern)
-- =============================================

CREATE TABLE skill_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES skill_listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote_type INT NOT NULL CHECK (vote_type IN (1, -1)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(listing_id, user_id)
);

CREATE INDEX idx_skill_votes_listing ON skill_votes(listing_id);
CREATE INDEX idx_skill_votes_user ON skill_votes(user_id);

-- Add vote counters to skill_listings
ALTER TABLE skill_listings ADD COLUMN IF NOT EXISTS upvotes INT NOT NULL DEFAULT 0;
ALTER TABLE skill_listings ADD COLUMN IF NOT EXISTS downvotes INT NOT NULL DEFAULT 0;
ALTER TABLE skill_listings ADD COLUMN IF NOT EXISTS score INT NOT NULL DEFAULT 0;
ALTER TABLE skill_listings ADD COLUMN IF NOT EXISTS comments_count INT NOT NULL DEFAULT 0;
ALTER TABLE skill_listings ADD COLUMN IF NOT EXISTS zaps_total BIGINT NOT NULL DEFAULT 0;

-- Recalculate votes trigger (same pattern as posts)
CREATE OR REPLACE FUNCTION recalculate_skill_votes()
RETURNS TRIGGER AS $$
DECLARE
  _listing_id UUID;
BEGIN
  _listing_id := COALESCE(NEW.listing_id, OLD.listing_id);
  UPDATE skill_listings SET
    upvotes   = COALESCE((SELECT COUNT(*) FROM skill_votes WHERE listing_id = _listing_id AND vote_type = 1), 0),
    downvotes = COALESCE((SELECT COUNT(*) FROM skill_votes WHERE listing_id = _listing_id AND vote_type = -1), 0),
    score     = COALESCE((SELECT SUM(vote_type) FROM skill_votes WHERE listing_id = _listing_id), 0)
  WHERE id = _listing_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_recalculate_skill_votes
  AFTER INSERT OR UPDATE OR DELETE ON skill_votes
  FOR EACH ROW EXECUTE FUNCTION recalculate_skill_votes();

-- RLS
ALTER TABLE skill_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Skill votes are viewable by everyone"
  ON skill_votes FOR SELECT USING (true);

CREATE POLICY "Users can insert own skill votes"
  ON skill_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own skill votes"
  ON skill_votes FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own skill votes"
  ON skill_votes FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- SKILL COMMENTS TABLE (threaded, matching posts pattern)
-- =============================================

CREATE TABLE skill_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES skill_listings(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES skill_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  depth INT NOT NULL DEFAULT 0,
  upvotes INT DEFAULT 0,
  downvotes INT DEFAULT 0,
  score INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_skill_comments_listing ON skill_comments(listing_id);
CREATE INDEX idx_skill_comments_author ON skill_comments(author_id);
CREATE INDEX idx_skill_comments_parent ON skill_comments(parent_id);
CREATE INDEX idx_skill_comments_created ON skill_comments(created_at DESC);

-- Auto-update timestamps
CREATE TRIGGER update_skill_comments_updated_at
  BEFORE UPDATE ON skill_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update comments_count on listing
CREATE OR REPLACE FUNCTION update_skill_comments_count()
RETURNS TRIGGER AS $$
DECLARE
  _listing_id UUID;
BEGIN
  _listing_id := COALESCE(NEW.listing_id, OLD.listing_id);
  UPDATE skill_listings SET
    comments_count = (SELECT COUNT(*) FROM skill_comments WHERE listing_id = _listing_id)
  WHERE id = _listing_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_skill_comments_count
  AFTER INSERT OR DELETE ON skill_comments
  FOR EACH ROW EXECUTE FUNCTION update_skill_comments_count();

-- RLS
ALTER TABLE skill_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Skill comments are publicly viewable"
  ON skill_comments FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create skill comments"
  ON skill_comments FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update own skill comments"
  ON skill_comments FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete own skill comments"
  ON skill_comments FOR DELETE USING (auth.uid() = author_id);

-- =============================================
-- EXPAND ZAP TARGET TYPES TO INCLUDE SKILLS
-- =============================================

-- Drop and recreate the CHECK constraint on zaps.target_type to add 'skill' + 'profile'
ALTER TABLE zaps DROP CONSTRAINT IF EXISTS zaps_target_type_check;
ALTER TABLE zaps ADD CONSTRAINT zaps_target_type_check
  CHECK (target_type IN ('post', 'gig', 'comment', 'skill', 'profile'));

-- =============================================
-- NOTIFICATION TYPES
-- =============================================
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'skill_comment';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'skill_vote';
