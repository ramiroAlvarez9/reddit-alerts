-- reddit-alerts schema
-- Run in the Supabase SQL editor (or via the CLI) to provision the database.

create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  website_url text,
  theme text not null default '',
  problems_solved text not null default '',
  competitors text[] not null default '{}',
  profile jsonb,
  created_at timestamptz not null default now()
);

create table if not exists keywords (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  term text not null
);

create table if not exists subreddits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  reddit_post_id text not null,
  subreddit text not null,
  title text not null,
  body text not null default '',
  url text not null,
  permalink text not null,
  author text not null default '',
  created_utc double precision not null,
  intent text not null default 'low',
  tags text[] not null default '{}',
  reply_draft text,
  reason text,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (business_id, reddit_post_id)
);

create index if not exists matches_business_created_idx
  on matches (business_id, created_utc desc);
create index if not exists subreddits_business_idx on subreddits (business_id);
create index if not exists keywords_business_idx on keywords (business_id);
