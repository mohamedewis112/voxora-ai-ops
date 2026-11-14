-- Voxora AI — Supabase schema (Postgres)
-- ===========================================
-- Run in Supabase SQL editor when the backend phase starts.
-- Mirrors prisma/schema.prisma. Auth is handled by Supabase Auth (auth.users)
-- with RLS policies keyed to profiles.role.

create extension if not exists "uuid-ossp";

-- ------------------------------- profiles ------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text unique not null,
  name text,
  role text not null default 'viewer' check (role in ('admin','manager','sales_agent','viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------- agents --------------------------------------
create table if not exists public.agents (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  job_title text default '',
  type text not null default 'customer_service',
  language text not null default 'ar_eg',
  personality text not null default 'professional',
  voice text default '',
  greeting text default '',
  closing text default '',
  objection_handling text default '',
  transfer_when text default '',
  max_duration_min int not null default 8,
  collect_info jsonb not null default '[]',
  never_say jsonb not null default '[]',
  system_prompt text default '',
  flow jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists public.agent_prompts (
  id uuid primary key default uuid_generate_v4(),
  agent_id uuid not null references public.agents on delete cascade,
  prompt text not null,
  created_at timestamptz not null default now()
);

-- ------------------------------ campaigns ------------------------------------
create table if not exists public.campaigns (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  purpose text default '',
  call_type text not null default 'outbound_sales',
  start_date timestamptz,
  time_from text default '10:00',
  time_to text default '18:00',
  max_calls_per_day int not null default 100,
  retry_attempts int not null default 3,
  retry_delay_hours int not null default 4,
  agent_id uuid references public.agents(id),
  knowledge_ids jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft','scheduled','running','paused','completed')),
  created_at timestamptz not null default now()
);

-- ------------------------------- contacts ------------------------------------
create table if not exists public.contacts (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  phone text unique not null,
  business text default '',
  category text default '',
  city text default '',
  area text default '',
  source text default 'manual',
  status text not null default 'active' check (status in ('active','dnd','archived','wrong_number')),
  campaign_id uuid references public.campaigns(id),
  last_call_at timestamptz,
  next_follow_up_at timestamptz,
  notes text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_contacts (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (campaign_id, contact_id)
);

create table if not exists public.tags (
  id uuid primary key default uuid_generate_v4(),
  name text unique not null,
  color text default ''
);

create table if not exists public.contact_tags (
  contact_id uuid not null references public.contacts(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (contact_id, tag_id)
);

-- -------------------------------- calls --------------------------------------
create table if not exists public.calls (
  id uuid primary key default uuid_generate_v4(),
  contact_id uuid references public.contacts(id),
  contact_name text default '',
  phone text not null,
  direction text not null default 'outbound' check (direction in ('outbound','inbound')),
  campaign_id uuid references public.campaigns(id),
  agent_id uuid references public.agents(id),
  started_at timestamptz not null,
  duration_sec int not null default 0,
  status text not null default 'answered' check (status in ('answered','no_answer','busy','wrong_number','failed')),
  outcome text not null default 'none',
  lead_score int not null default 0,
  sentiment text not null default 'neutral',
  summary text default '',
  ai_notes text default '',
  follow_up_action text default '',
  extracted jsonb not null default '[]',
  objection text,
  recording_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.call_transcripts (
  id uuid primary key default uuid_generate_v4(),
  call_id uuid unique not null references public.calls(id) on delete cascade,
  lines jsonb not null default '[]'
);

create table if not exists public.call_events (
  id uuid primary key default uuid_generate_v4(),
  call_id uuid not null references public.calls(id) on delete cascade,
  name text not null, -- call.started | call.ringing | call.answered | agent.listening | agent.thinking | agent.speaking | call.transferred | call.completed | call.failed
  payload jsonb not null default '{}',
  at timestamptz not null default now()
);

create table if not exists public.call_recordings (
  id uuid primary key default uuid_generate_v4(),
  call_id uuid unique not null references public.calls(id) on delete cascade,
  file_path text not null, -- Supabase Storage object path (bucket: recordings — private)
  duration_sec int not null default 0,
  created_at timestamptz not null default now()
);

-- -------------------------------- leads --------------------------------------
create table if not exists public.leads (
  id uuid primary key default uuid_generate_v4(),
  contact_id uuid references public.contacts(id),
  name text default '',
  phone text not null,
  business text default '',
  stage text not null default 'new' check (stage in ('new','contacted','interested','followup','ready_to_close','transferred','won','lost')),
  score int not null default 0,
  last_call_at timestamptz,
  next_action text default '',
  campaign_id uuid references public.campaigns(id),
  created_at timestamptz not null default now()
);

-- ------------------------------ follow-ups -----------------------------------
create table if not exists public.followups (
  id uuid primary key default uuid_generate_v4(),
  contact_id uuid references public.contacts(id),
  name text default '',
  phone text not null,
  reason text default '',
  due_at timestamptz not null,
  campaign_id uuid references public.campaigns(id),
  status text not null default 'pending' check (status in ('pending','done','postponed','canceled')),
  call_id uuid references public.calls(id),
  created_at timestamptz not null default now()
);

-- ----------------------------- call queue ------------------------------------
create table if not exists public.queue_items (
  id uuid primary key default uuid_generate_v4(),
  contact_id uuid references public.contacts(id),
  name text default '',
  phone text not null,
  campaign_id uuid references public.campaigns(id),
  attempts int not null default 0,
  priority text not null default 'normal' check (priority in ('high','normal','low')),
  scheduled_at timestamptz,
  status text not null default 'waiting' check (status in ('waiting','calling','paused','done','canceled')),
  created_at timestamptz not null default now()
);

-- ---------------------------- knowledge base ---------------------------------
create table if not exists public.knowledge_base (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  category text default '',
  type text not null default 'text' check (type in ('text','faq','file')),
  content text default '',
  faq jsonb not null default '[]',
  file_name text,
  tags jsonb not null default '[]',
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ------------------------------- settings ------------------------------------
create table if not exists public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ================================ indexes ====================================
create index if not exists idx_calls_started_at on public.calls (started_at desc);
create index if not exists idx_calls_campaign on public.calls (campaign_id);
create index if not exists idx_contacts_status on public.contacts (status);
create index if not exists idx_contacts_campaign on public.contacts (campaign_id);
create index if not exists idx_leads_stage on public.leads (stage);
create index if not exists idx_followups_due on public.followups (due_at);
create index if not exists idx_queue_status on public.queue_items (status, priority desc, scheduled_at);

-- ============================ realtime publication ===========================
-- The web app subscribes to these tables/channels (see docs/INTEGRATION.md):
alter publication supabase_realtime add table public.calls;
alter publication supabase_realtime add table public.call_events;
alter publication supabase_realtime add table public.queue_items;
alter publication supabase_realtime add table public.followups;

-- ================================ RLS notes ==================================
-- enable RLS on every table and gate writes by profiles.role:
--   admin: all; manager: everything except settings/secrets;
--   sales_agent: leads/followups/calls read + followups write;
--   viewer: read-only on non-sensitive tables.
-- Do-not-call enforcement: a BEFORE INSERT trigger on queue_items that
-- rejects contacts with status='dnd' unless performed by role='admin'.
