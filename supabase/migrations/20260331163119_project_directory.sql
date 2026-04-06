-- Project Directory: paid listings (500 sats) for projects
create table project_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  title text not null constraint title_length check (char_length(title) <= 100),
  url text not null,
  description text constraint description_length check (description is null or char_length(description) <= 500),
  tags text[] default '{}',
  logo_url text,
  status text default 'active' check (status in ('active', 'hidden', 'expired')),
  zap_tx_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '1 year')
);

-- Indexes
create index idx_project_listings_user_id on project_listings (user_id);
create index idx_project_listings_status on project_listings (status);
create index idx_project_listings_created_at on project_listings (created_at desc);
create index idx_project_listings_tags on project_listings using gin (tags);

-- RLS
alter table project_listings enable row level security;

-- Anyone can read active listings
create policy "Anyone can read active project listings"
  on project_listings for select
  using (status = 'active');

-- Authenticated users can insert their own listings
create policy "Users can insert own project listings"
  on project_listings for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Users can update their own listings
create policy "Users can update own project listings"
  on project_listings for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can delete their own listings
create policy "Users can delete own project listings"
  on project_listings for delete
  to authenticated
  using (auth.uid() = user_id);
