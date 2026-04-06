-- Enable RLS on core tables and add appropriate policies (#76)

-- ============================================
-- PROFILES
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can read profiles (public directory)
CREATE POLICY "profiles_select_public" ON profiles
  FOR SELECT USING (true);

-- Users can update their own profile
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users can insert their own profile (signup)
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ============================================
-- GIGS
-- ============================================
ALTER TABLE gigs ENABLE ROW LEVEL SECURITY;

-- Anyone can read active gigs
CREATE POLICY "gigs_select_public" ON gigs
  FOR SELECT USING (true);

-- Authenticated users can create gigs
CREATE POLICY "gigs_insert_auth" ON gigs
  FOR INSERT WITH CHECK (auth.uid() = poster_id);

-- Users can update their own gigs
CREATE POLICY "gigs_update_own" ON gigs
  FOR UPDATE USING (auth.uid() = poster_id)
  WITH CHECK (auth.uid() = poster_id);

-- Users can delete their own gigs
CREATE POLICY "gigs_delete_own" ON gigs
  FOR DELETE USING (auth.uid() = poster_id);

-- ============================================
-- APPLICATIONS
-- ============================================
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- Applicants can see their own applications
CREATE POLICY "applications_select_own" ON applications
  FOR SELECT USING (
    auth.uid() = applicant_id
    OR auth.uid() IN (SELECT poster_id FROM gigs WHERE gigs.id = applications.gig_id)
  );

-- Authenticated users can create applications
CREATE POLICY "applications_insert_auth" ON applications
  FOR INSERT WITH CHECK (auth.uid() = applicant_id);

-- Applicants can update their own applications (withdraw)
CREATE POLICY "applications_update_own" ON applications
  FOR UPDATE USING (
    auth.uid() = applicant_id
    OR auth.uid() IN (SELECT poster_id FROM gigs WHERE gigs.id = applications.gig_id)
  );

-- ============================================
-- MESSAGES
-- ============================================
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Users can only read messages from conversations they participate in
CREATE POLICY "messages_select_participant" ON messages
  FOR SELECT USING (
    auth.uid() = sender_id
    OR auth.uid() IN (
      SELECT unnest(participant_ids) FROM conversations WHERE conversations.id = messages.conversation_id
    )
  );

-- Users can insert messages into conversations they participate in
CREATE POLICY "messages_insert_participant" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND auth.uid() IN (
      SELECT unnest(participant_ids) FROM conversations WHERE conversations.id = conversation_id
    )
  );

-- Users can update messages they sent (e.g., mark as read)
CREATE POLICY "messages_update_participant" ON messages
  FOR UPDATE USING (
    auth.uid() IN (
      SELECT unnest(participant_ids) FROM conversations WHERE conversations.id = messages.conversation_id
    )
  );
