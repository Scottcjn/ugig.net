-- Directory listings: social interactions (votes, comments) + zap support
-- ====================================================================

-- =============================================
-- DIRECTORY VOTES TABLE (upvote/downvote, matching skills pattern)
-- =============================================

CREATE TABLE directory_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES project_listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote_type INT NOT NULL CHECK (vote_type IN (1, -1)),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(listing_id, user_id)
);

CREATE INDEX idx_directory_votes_listing ON directory_votes(listing_id);
CREATE INDEX idx_directory_votes_user ON directory_votes(user_id);

-- Add vote/comment/zap counters to project_listings
ALTER TABLE project_listings ADD COLUMN IF NOT EXISTS upvotes INT NOT NULL DEFAULT 0;
ALTER TABLE project_listings ADD COLUMN IF NOT EXISTS downvotes INT NOT NULL DEFAULT 0;
ALTER TABLE project_listings ADD COLUMN IF NOT EXISTS score INT NOT NULL DEFAULT 0;
ALTER TABLE project_listings ADD COLUMN IF NOT EXISTS comments_count INT NOT NULL DEFAULT 0;
ALTER TABLE project_listings ADD COLUMN IF NOT EXISTS zaps_total BIGINT NOT NULL DEFAULT 0;

-- Recalculate votes trigger (same pattern as skills)
CREATE OR REPLACE FUNCTION recalculate_directory_votes()
RETURNS TRIGGER AS $$
DECLARE
  _listing_id UUID;
BEGIN
  _listing_id := COALESCE(NEW.listing_id, OLD.listing_id);
  UPDATE project_listings SET
    upvotes   = COALESCE((SELECT COUNT(*) FROM directory_votes WHERE listing_id = _listing_id AND vote_type = 1), 0),
    downvotes = COALESCE((SELECT COUNT(*) FROM directory_votes WHERE listing_id = _listing_id AND vote_type = -1), 0),
    score     = COALESCE((SELECT SUM(vote_type) FROM directory_votes WHERE listing_id = _listing_id), 0)
  WHERE id = _listing_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_recalculate_directory_votes
  AFTER INSERT OR UPDATE OR DELETE ON directory_votes
  FOR EACH ROW EXECUTE FUNCTION recalculate_directory_votes();

-- RLS
ALTER TABLE directory_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Directory votes are viewable by everyone"
  ON directory_votes FOR SELECT USING (true);

CREATE POLICY "Users can insert own directory votes"
  ON directory_votes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own directory votes"
  ON directory_votes FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own directory votes"
  ON directory_votes FOR DELETE USING (auth.uid() = user_id);

-- Service role bypass
CREATE POLICY "Service role full access directory_votes"
  ON directory_votes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================
-- DIRECTORY COMMENTS TABLE (threaded, matching skills pattern)
-- =============================================

CREATE TABLE directory_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES project_listings(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES directory_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  depth INT NOT NULL DEFAULT 0,
  upvotes INT DEFAULT 0,
  downvotes INT DEFAULT 0,
  score INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_directory_comments_listing ON directory_comments(listing_id);
CREATE INDEX idx_directory_comments_author ON directory_comments(author_id);
CREATE INDEX idx_directory_comments_parent ON directory_comments(parent_id);
CREATE INDEX idx_directory_comments_created ON directory_comments(created_at DESC);

-- Auto-update timestamps
CREATE TRIGGER update_directory_comments_updated_at
  BEFORE UPDATE ON directory_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update comments_count on listing
CREATE OR REPLACE FUNCTION update_directory_comments_count()
RETURNS TRIGGER AS $$
DECLARE
  _listing_id UUID;
BEGIN
  _listing_id := COALESCE(NEW.listing_id, OLD.listing_id);
  UPDATE project_listings SET
    comments_count = (SELECT COUNT(*) FROM directory_comments WHERE listing_id = _listing_id)
  WHERE id = _listing_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_directory_comments_count
  AFTER INSERT OR DELETE ON directory_comments
  FOR EACH ROW EXECUTE FUNCTION update_directory_comments_count();

-- RLS
ALTER TABLE directory_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Directory comments are publicly viewable"
  ON directory_comments FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create directory comments"
  ON directory_comments FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update own directory comments"
  ON directory_comments FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete own directory comments"
  ON directory_comments FOR DELETE USING (auth.uid() = author_id);

-- Service role bypass
CREATE POLICY "Service role full access directory_comments"
  ON directory_comments FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================
-- ZAP TOTAL TRIGGER FOR DIRECTORY
-- =============================================

CREATE OR REPLACE FUNCTION update_directory_zaps_total()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.target_type = 'directory' THEN
    UPDATE project_listings SET
      zaps_total = COALESCE((
        SELECT SUM(amount_sats) FROM zaps
        WHERE target_type = 'directory' AND target_id = NEW.target_id
      ), 0)
    WHERE id = NEW.target_id::uuid;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_update_directory_zaps_total
  AFTER INSERT ON zaps
  FOR EACH ROW EXECUTE FUNCTION update_directory_zaps_total();

-- =============================================
-- EXPAND ZAP TARGET TYPES TO INCLUDE DIRECTORY
-- =============================================

ALTER TABLE zaps DROP CONSTRAINT IF EXISTS zaps_target_type_check;
ALTER TABLE zaps ADD CONSTRAINT zaps_target_type_check
  CHECK (target_type IN ('post', 'gig', 'comment', 'skill', 'profile', 'mcp', 'prompt', 'directory'));

-- =============================================
-- NOTIFICATION TYPES
-- =============================================
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'directory_comment';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'directory_vote';
