-- Add foreign key from project_listings.user_id to profiles.id
-- so PostgREST can resolve the join for the directory page
alter table project_listings
  add constraint project_listings_user_id_profiles_fkey
  foreign key (user_id) references profiles(id) on delete cascade;
