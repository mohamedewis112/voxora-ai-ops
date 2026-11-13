-- !!! LEGACY / LOCAL DESIGN REFERENCE ONLY !!!
-- DO NOT APPLY THIS FILE TO THE LIVE DALEELY DATABASE.
-- Live production uses voxora-production.sql + voxora-production-extensions.sql
-- and reviewed Supabase migrations.

-- ================================================================================
-- Voxora AI — Operations schema for the EXISTING Daleely Supabase project
-- (repository: voxora-ai-ops, branch: feat/ops-integration)
--
-- SAFETY RULES (from the ops spec):
--   * Run against the EXISTING Daleely Supabase project — never a second DB.
--   * Everything lives in a dedicated `ops` schema; NO existing Daleely tables
--     are touched, renamed, or dropped by this migration.
--   * Reversible: `DROP SCHEMA ops CASCADE;` removes everything created here.
--   * Listings themselves stay the property of Daleely tables (source of truth).
--     `ops.listings` is the ops mirror/working set the platform mutates.
--
-- Apply with: psql $DATABASE_URL -f supabase/ops-schema.sql
-- (or paste into Supabase Studio → SQL Editor, then run as one transaction)
-- ================================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS ops;

-- ================================================================================
-- 1) Tables
-- ================================================================================

-- Mirror of tenant auth users / profiles (matched by normalized phone).
-- Production adapter may READ real profiles instead of writing here.
CREATE TABLE IF NOT EXISTS ops.users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daleely_user_id  uuid,                    -- FK to the real auth.users when linked
  full_name        text NOT NULL,
  raw_phone        text NOT NULL,
  normalized_phone text UNIQUE NOT NULL,    -- +201XXXXXXXXX
  is_registered    boolean NOT NULL DEFAULT false,
  email            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Platform team. Two active sales today; model is deliberately open-ended.
CREATE TABLE IF NOT EXISTS ops.sales_agents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daleely_user_id   uuid,                   -- optional link to auth.users
  name              text NOT NULL,
  role              text NOT NULL DEFAULT 'sales'
                    CHECK (role IN ('admin','manager','sales','viewer','ai_system')),
  raw_phone         text,
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','disabled','removed')),
  can_receive_leads boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Business listing working set (Daleely stays the source of truth).
CREATE TABLE IF NOT EXISTS ops.listings (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daleely_listing_id     uuid,              -- FK to the real Daleely listing when linked
  business_name          text NOT NULL,
  raw_phone              text NOT NULL,
  normalized_phone       text NOT NULL,
  whatsapp               text,
  category               text,
  specialization         text,
  governorate            text,
  city                   text,
  village                text,
  address                text,
  description            text,
  logo                   text,
  images                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  social_links           jsonb NOT NULL DEFAULT '{}'::jsonb,
  website                text,
  email                  text,
  opening_hours          text,
  products               text,
  owner_user_id          uuid REFERENCES ops.users(id),
  owner_phone_normalized text,
  -- active | merged | hidden | suspended | closed_business | invalid_phone |
  -- out_of_service | wrong_business_phone
  status                 text NOT NULL DEFAULT 'active',
  canonical_listing_id   uuid REFERENCES ops.listings(id),
  source                 text NOT NULL DEFAULT 'daleely',
  deleted_at             timestamptz,       -- soft delete ONLY (admin reversible)
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_listings_phone_idx    ON ops.listings (normalized_phone);
CREATE INDEX IF NOT EXISTS ops_listings_status_idx   ON ops.listings (status);
CREATE INDEX IF NOT EXISTS ops_listings_owner_idx    ON ops.listings (owner_user_id);
CREATE INDEX IF NOT EXISTS ops_listings_canonical_idx ON ops.listings (canonical_listing_id);

-- Sales pipeline lead — auto-created for every eligible phone added by Admin.
CREATE TABLE IF NOT EXISTS ops.leads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_phone         text NOT NULL,
  normalized_phone  text UNIQUE NOT NULL,   -- one logical lead per phone
  prefix            text,                   -- 010 | 011 | 012 | 015
  listing_id        uuid REFERENCES ops.listings(id),
  user_id           uuid REFERENCES ops.users(id),
  business_name     text NOT NULL DEFAULT '',
  customer_name     text NOT NULL DEFAULT '',
  status            text NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','assigned','queued','calling','ringing','answered',
                                      'busy','no_answer','switched_off','invalid_number','out_of_service',
                                      'callback','interested','not_interested','whatsapp_followup',
                                      'transferred_to_sales','linked','closed_business','completed','failed')),
  priority          text NOT NULL DEFAULT 'normal' CHECK (priority IN ('high','normal','low')),
  assigned_agent_id uuid REFERENCES ops.sales_agents(id),
  original_agent_id uuid REFERENCES ops.sales_agents(id),  -- preserved across AI Bot runs
  bot_status        text NOT NULL DEFAULT 'none'
                    CHECK (bot_status IN ('none','queued','running','done','returned')),
  bot_added_by_id   uuid REFERENCES ops.sales_agents(id),
  bot_added_at      timestamptz,
  source            text NOT NULL DEFAULT 'admin',  -- admin | website | whatsapp | import
  campaign          text,
  last_outcome      text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_leads_agent_idx  ON ops.leads (assigned_agent_id);
CREATE INDEX IF NOT EXISTS ops_leads_status_idx ON ops.leads (status);
CREATE INDEX IF NOT EXISTS ops_leads_prefix_idx ON ops.leads (prefix);

-- Every call attempt (sales or AI) against a lead.
CREATE TABLE IF NOT EXISTS ops.call_attempts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid NOT NULL REFERENCES ops.leads(id),
  agent_type   text NOT NULL CHECK (agent_type IN ('sales_agent','ai_agent','system')),
  agent_id     uuid REFERENCES ops.sales_agents(id),
  outcome      text NOT NULL,
  reason       text,
  confidence   int,
  notes        text,
  duration_sec int NOT NULL DEFAULT 0,
  started_at   timestamptz,
  ended_at     timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_call_attempts_lead_idx ON ops.call_attempts (lead_id);

CREATE TABLE IF NOT EXISTS ops.followups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid NOT NULL REFERENCES ops.leads(id),
  scheduled_at timestamptz NOT NULL,
  reason       text NOT NULL DEFAULT '',
  assignee_id  uuid REFERENCES ops.sales_agents(id),
  priority     text NOT NULL DEFAULT 'normal',
  status       text NOT NULL DEFAULT 'scheduled'
               CHECK (status IN ('scheduled','due','completed','missed','cancelled','rescheduled')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS ops_followups_lead_idx ON ops.followups (lead_id);

-- AI Bot queue — lead enters WITHOUT losing its sales owner.
CREATE TABLE IF NOT EXISTS ops.bot_queue (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid UNIQUE NOT NULL REFERENCES ops.leads(id),
  status       text NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued','running','paused','done','failed','returned')),
  priority     int NOT NULL DEFAULT 5,   -- 1 = highest
  attempts     int NOT NULL DEFAULT 0,
  scheduled_at timestamptz,
  last_result  text,
  added_by_id  uuid REFERENCES ops.sales_agents(id),
  added_at     timestamptz NOT NULL DEFAULT now(),
  started_at   timestamptz,
  finished_at  timestamptz
);

CREATE TABLE IF NOT EXISTS ops.whatsapp_threads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          uuid REFERENCES ops.leads(id),
  phone_normalized text NOT NULL,
  display_name     text NOT NULL DEFAULT '',
  listing_id       uuid REFERENCES ops.listings(id),
  last_message_at  timestamptz,
  unread_count     int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_wa_threads_lead_idx ON ops.whatsapp_threads (lead_id);

CREATE TABLE IF NOT EXISTS ops.whatsapp_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id    uuid NOT NULL REFERENCES ops.whatsapp_threads(id) ON DELETE CASCADE,
  direction    text NOT NULL CHECK (direction IN ('out','in')),
  body         text NOT NULL,
  template     text,
  status       text NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued','sent','delivered','read','failed','received')),
  actor_type   text NOT NULL DEFAULT 'sales_agent'
               CHECK (actor_type IN ('sales_agent','ai_agent','customer','system')),
  actor_id     uuid REFERENCES ops.sales_agents(id),
  sent_at      timestamptz,
  delivered_at timestamptz,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_wa_messages_thread_idx ON ops.whatsapp_messages (thread_id);

-- Unified per-lead timeline (never fragmented histories).
CREATE TABLE IF NOT EXISTS ops.timeline_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    uuid NOT NULL REFERENCES ops.leads(id),
  type       text NOT NULL,
  actor_type text NOT NULL DEFAULT 'system'
             CHECK (actor_type IN ('admin','sales_agent','ai_agent','system','customer')),
  actor_id   uuid REFERENCES ops.sales_agents(id),
  actor_name text,
  title      text NOT NULL,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_timeline_lead_idx ON ops.timeline_events (lead_id, created_at);

-- Full audit trail — no silent destructive changes.
CREATE TABLE IF NOT EXISTS ops.audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type  text NOT NULL CHECK (actor_type IN ('admin','sales_agent','ai_agent','system','customer')),
  actor_id    text,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text,
  old_value   jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_value   jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason      text,
  source      text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_audit_entity_idx ON ops.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ops_audit_action_idx ON ops.audit_logs (action);

CREATE TABLE IF NOT EXISTS ops.owner_link_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id       uuid NOT NULL REFERENCES ops.listings(id),
  user_id          uuid REFERENCES ops.users(id),
  phone_normalized text NOT NULL,
  method           text NOT NULL CHECK (method IN ('auto','manual')),
  confidence       int,
  reason           text,
  actor_type       text NOT NULL DEFAULT 'system',
  actor_id         text,
  status           text NOT NULL DEFAULT 'linked'
                   CHECK (status IN ('linked','rejected','pending_review')),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_owner_link_listing_idx ON ops.owner_link_events (listing_id);

-- Duplicate detection + merge workflow (never destructive, always reversible).
CREATE TABLE IF NOT EXISTS ops.merge_jobs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_listing_id uuid NOT NULL REFERENCES ops.listings(id),
  duplicate_listing_id uuid NOT NULL REFERENCES ops.listings(id),
  confidence           int NOT NULL,
  reasons              jsonb NOT NULL DEFAULT '[]'::jsonb,
  status               text NOT NULL DEFAULT 'pending_review'
                       CHECK (status IN ('pending_review','auto_merged','merged','rejected','manual_review')),
  field_changes        jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by_id       uuid REFERENCES ops.sales_agents(id),
  reviewed_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_merge_status_idx ON ops.merge_jobs (status);

CREATE TABLE IF NOT EXISTS ops.notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid REFERENCES ops.sales_agents(id),
  target_phone  text,
  title         text NOT NULL,
  body          text NOT NULL,
  type          text NOT NULL DEFAULT 'info' CHECK (type IN ('info','success','warning','error')),
  lead_id       uuid REFERENCES ops.leads(id),
  read          boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ================================================================================
-- 2) updated_at triggers
-- ================================================================================
CREATE OR REPLACE FUNCTION ops.touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ops_listings_touch ON ops.listings;
CREATE TRIGGER ops_listings_touch BEFORE UPDATE ON ops.listings
  FOR EACH ROW EXECUTE FUNCTION ops.touch_updated_at();

DROP TRIGGER IF EXISTS ops_leads_touch ON ops.leads;
CREATE TRIGGER ops_leads_touch BEFORE UPDATE ON ops.leads
  FOR EACH ROW EXECUTE FUNCTION ops.touch_updated_at();

-- ================================================================================
-- 3) Fair-distribution helper (deterministic, per-prefix balance)
--    Mirrors src/lib/server/assignment.ts so SQL-side writers behave identically.
-- ================================================================================
CREATE OR REPLACE FUNCTION ops.assign_lead_fairly(p_lead uuid)
RETURNS uuid AS $$
DECLARE
  v_prefix text;
  v_agent uuid;
BEGIN
  SELECT prefix INTO v_prefix FROM ops.leads WHERE id = p_lead;

  SELECT a.id INTO v_agent
  FROM ops.sales_agents a
  LEFT JOIN LATERAL (
    SELECT count(*) AS prefix_count
    FROM ops.leads l
    WHERE l.assigned_agent_id = a.id
      AND COALESCE(l.prefix, 'other') = COALESCE(v_prefix, 'other')
  ) pc ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS total_count
    FROM ops.leads l
    WHERE l.assigned_agent_id = a.id
  ) tc ON true
  WHERE a.status = 'active' AND a.can_receive_leads AND a.role IN ('sales','manager')
  ORDER BY pc.prefix_count ASC, tc.total_count ASC, a.id ASC   -- deterministic
  LIMIT 1;

  RETURN v_agent;
END;
$$ LANGUAGE plpgsql;

-- ================================================================================
-- 4) Row Level Security
--    Roles resolve from profiles (admin | manager | sales_agent | viewer).
--    Sales users are scoped to their assigned leads; they never get broad DB
--    admin access. Service Role key stays server-side ONLY (never in frontend).
-- ================================================================================
ALTER TABLE ops.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.sales_agents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.listings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.leads             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.call_attempts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.followups         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.bot_queue         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.whatsapp_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.timeline_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.audit_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.owner_link_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.merge_jobs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.notifications     ENABLE ROW LEVEL SECURITY;

-- helper: current profile role (adjust to your real profiles table / claims)
CREATE OR REPLACE FUNCTION ops.current_role() RETURNS text AS $$
  SELECT COALESCE(
    (SELECT role::text FROM public.profiles WHERE id = auth.uid()), 'viewer'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION ops.current_agent_id() RETURNS uuid AS $$
  SELECT id FROM ops.sales_agents WHERE daleely_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Admin + Manager: full ops access
CREATE POLICY ops_admin_full ON ops.leads
  FOR ALL USING (ops.current_role() IN ('admin','manager'))
  WITH CHECK (ops.current_role() IN ('admin','manager'));

-- Sales: read + update own assigned leads; cannot delete or reassign others
CREATE POLICY ops_sales_read_own ON ops.leads
  FOR SELECT USING (assigned_agent_id = ops.current_agent_id() OR ops.current_role() IN ('admin','manager'));
CREATE POLICY ops_sales_update_own ON ops.leads
  FOR UPDATE USING (assigned_agent_id = ops.current_agent_id())
  WITH CHECK (assigned_agent_id = ops.current_agent_id());

-- Viewer: read-only everywhere in ops
CREATE POLICY ops_viewer_read ON ops.listings
  FOR SELECT USING (true);
CREATE POLICY ops_viewer_read_leads ON ops.leads
  FOR SELECT USING (ops.current_role() = 'viewer');

-- Audit logs: insert by any authenticated ops actor; readable by admin/manager only
CREATE POLICY ops_audit_insert ON ops.audit_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY ops_audit_read ON ops.audit_logs
  FOR SELECT USING (ops.current_role() IN ('admin','manager'));

-- Listings mutations: admin/manager only (merge / hide / restore are sensitive)
CREATE POLICY ops_listing_write ON ops.listings
  FOR ALL USING (ops.current_role() IN ('admin','manager'))
  WITH CHECK (ops.current_role() IN ('admin','manager'));
CREATE POLICY ops_listing_read ON ops.listings
  FOR SELECT USING (true);

-- Bot queue: admin/manager manage, sales read own
CREATE POLICY ops_bot_admin ON ops.bot_queue
  FOR ALL USING (ops.current_role() IN ('admin','manager'))
  WITH CHECK (ops.current_role() IN ('admin','manager'));

-- WhatsApp: sales see threads of their leads; admin all
CREATE POLICY ops_wa_admin ON ops.whatsapp_threads
  FOR ALL USING (ops.current_role() IN ('admin','manager'))
  WITH CHECK (ops.current_role() IN ('admin','manager'));

-- Notifications: user reads own; system/service-role writes
CREATE POLICY ops_notif_read ON ops.notifications
  FOR SELECT USING (target_user_id = ops.current_agent_id() OR ops.current_role() IN ('admin','manager'));

-- NOTE: policies above are the minimum set. Review with the Daleely team and
-- extend per table as needed. NEVER disable RLS globally to "make it work".

-- ================================================================================
-- 5) Rollback (reversible by design)
--    DROP SCHEMA ops CASCADE;
-- ================================================================================

COMMIT;
