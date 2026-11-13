-- Voxora AI — production-safe operations layer for the EXISTING Daleely Supabase project.
-- No existing Daleely table is dropped or renamed. Public listing mutations are limited to
-- explicit owner-link / visibility / merge operations and are fully audited/reversible.

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1) Operations tables (public prefix avoids exposing a custom schema through Data API)
--    RLS is enabled and anon/authenticated have NO direct privileges. Voxora's server
--    uses a server-only Supabase secret key and calls the API/RPC layer.
-- -----------------------------------------------------------------------------

create table if not exists public.voxora_sales_agents (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  daleely_user_id uuid,
  name text not null,
  role text not null default 'sales' check (role in ('admin','manager','sales','viewer','ai_system')),
  raw_phone text,
  status text not null default 'active' check (status in ('active','disabled','removed')),
  can_receive_leads boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.voxora_leads (
  id uuid primary key default gen_random_uuid(),
  raw_phone text not null,
  normalized_phone text not null unique,
  prefix text,
  daleely_listing_id uuid references public.listings(id) on delete set null,
  daleely_user_id uuid,
  business_name text not null default '',
  customer_name text not null default '',
  status text not null default 'new' check (status in (
    'new','assigned','queued','calling','ringing','answered','busy','no_answer','switched_off',
    'invalid_number','out_of_service','callback','interested','not_interested','whatsapp_followup',
    'transferred_to_sales','linked','closed_business','completed','failed'
  )),
  priority text not null default 'normal' check (priority in ('high','normal','low')),
  assigned_agent_id uuid references public.voxora_sales_agents(id) on delete set null,
  original_agent_id uuid references public.voxora_sales_agents(id) on delete set null,
  bot_status text not null default 'none' check (bot_status in ('none','queued','running','done','returned')),
  bot_added_by_id uuid references public.voxora_sales_agents(id) on delete set null,
  bot_added_at timestamptz,
  source text not null default 'admin',
  campaign text,
  last_outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists voxora_leads_agent_idx on public.voxora_leads(assigned_agent_id);
create index if not exists voxora_leads_status_idx on public.voxora_leads(status);
create index if not exists voxora_leads_prefix_idx on public.voxora_leads(prefix);
create index if not exists voxora_leads_listing_idx on public.voxora_leads(daleely_listing_id);

create table if not exists public.voxora_call_attempts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.voxora_leads(id) on delete cascade,
  agent_type text not null check (agent_type in ('sales_agent','ai_agent','system')),
  agent_id uuid references public.voxora_sales_agents(id) on delete set null,
  outcome text not null,
  reason text,
  confidence int,
  notes text,
  duration_sec int not null default 0,
  telephony_call_id text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists voxora_calls_lead_idx on public.voxora_call_attempts(lead_id, created_at desc);

create table if not exists public.voxora_followups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.voxora_leads(id) on delete cascade,
  scheduled_at timestamptz not null,
  reason text not null default '',
  assignee_id uuid references public.voxora_sales_agents(id) on delete set null,
  priority text not null default 'normal',
  status text not null default 'scheduled' check (status in ('scheduled','due','completed','missed','cancelled','rescheduled')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists voxora_followups_due_idx on public.voxora_followups(status, scheduled_at);

create table if not exists public.voxora_bot_queue (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid unique not null references public.voxora_leads(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','paused','done','failed','returned')),
  priority int not null default 5,
  attempts int not null default 0,
  scheduled_at timestamptz,
  last_result text,
  added_by_id uuid references public.voxora_sales_agents(id) on delete set null,
  added_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.voxora_whatsapp_threads (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.voxora_leads(id) on delete set null,
  phone_normalized text not null,
  display_name text not null default '',
  daleely_listing_id uuid references public.listings(id) on delete set null,
  last_message_at timestamptz,
  unread_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists voxora_wa_thread_lead_idx on public.voxora_whatsapp_threads(lead_id);

create table if not exists public.voxora_whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.voxora_whatsapp_threads(id) on delete cascade,
  direction text not null check (direction in ('out','in')),
  body text not null,
  template text,
  status text not null default 'queued' check (status in ('queued','sent','delivered','read','failed','received')),
  actor_type text not null default 'sales_agent' check (actor_type in ('sales_agent','ai_agent','customer','system')),
  actor_id uuid references public.voxora_sales_agents(id) on delete set null,
  provider_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists voxora_wa_message_thread_idx on public.voxora_whatsapp_messages(thread_id, created_at);

create table if not exists public.voxora_timeline_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.voxora_leads(id) on delete cascade,
  type text not null,
  actor_type text not null default 'system' check (actor_type in ('admin','sales_agent','ai_agent','system','customer')),
  actor_id text,
  actor_name text,
  title text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists voxora_timeline_lead_idx on public.voxora_timeline_events(lead_id, created_at);

create table if not exists public.voxora_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('admin','sales_agent','ai_agent','system','customer')),
  actor_id text,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_value jsonb not null default '{}'::jsonb,
  new_value jsonb not null default '{}'::jsonb,
  reason text,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists voxora_audit_entity_idx on public.voxora_audit_logs(entity_type, entity_id, created_at desc);

create table if not exists public.voxora_owner_link_events (
  id uuid primary key default gen_random_uuid(),
  daleely_listing_id uuid not null references public.listings(id) on delete cascade,
  daleely_user_id uuid,
  phone_normalized text not null,
  method text not null check (method in ('auto','manual')),
  confidence int,
  reason text,
  actor_type text not null default 'system',
  actor_id text,
  status text not null default 'linked' check (status in ('linked','rejected','pending_review')),
  created_at timestamptz not null default now()
);
create index if not exists voxora_owner_link_listing_idx on public.voxora_owner_link_events(daleely_listing_id, created_at desc);

create table if not exists public.voxora_listing_state (
  daleely_listing_id uuid primary key references public.listings(id) on delete cascade,
  ops_status text not null default 'active',
  phone_status text,
  previous_is_visible boolean,
  previous_hidden_reason text,
  previous_status text,
  reason text,
  source text,
  confidence int,
  last_verified_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.voxora_merge_jobs (
  id uuid primary key default gen_random_uuid(),
  canonical_listing_id uuid not null references public.listings(id) on delete cascade,
  duplicate_listing_id uuid not null references public.listings(id) on delete cascade,
  confidence int not null,
  reasons jsonb not null default '[]'::jsonb,
  status text not null default 'pending_review' check (status in ('pending_review','auto_merged','merged','rejected','manual_review','restored')),
  canonical_before jsonb not null default '{}'::jsonb,
  duplicate_before jsonb not null default '{}'::jsonb,
  field_changes jsonb not null default '[]'::jsonb,
  reviewed_by_id uuid references public.voxora_sales_agents(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(canonical_listing_id, duplicate_listing_id)
);
create index if not exists voxora_merge_status_idx on public.voxora_merge_jobs(status, created_at desc);

create table if not exists public.voxora_internal_notifications (
  id uuid primary key default gen_random_uuid(),
  target_agent_id uuid references public.voxora_sales_agents(id) on delete set null,
  target_phone text,
  title text not null,
  body text not null,
  type text not null default 'info' check (type in ('info','success','warning','error')),
  lead_id uuid references public.voxora_leads(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2) Generic helpers
-- -----------------------------------------------------------------------------

create or replace function public.voxora_normalize_egypt_phone(p_raw text)
returns text
language sql
immutable
strict
as $$
  with x as (
    select regexp_replace(p_raw, '\\D', '', 'g') as d
  )
  select case
    when d ~ '^01[0125][0-9]{8}$' then d
    when d ~ '^201[0125][0-9]{8}$' then '0' || substr(d, 3)
    when d ~ '^00201[0125][0-9]{8}$' then '0' || substr(d, 5)
    else null
  end
  from x;
$$;

create or replace function public.voxora_pick_sales_agent(p_prefix text)
returns uuid
language sql
stable
as $$
  select a.id
  from public.voxora_sales_agents a
  left join lateral (
    select count(*)::bigint as c
    from public.voxora_leads l
    where l.assigned_agent_id=a.id and coalesce(l.prefix,'other')=coalesce(p_prefix,'other')
  ) pc on true
  left join lateral (
    select count(*)::bigint as c
    from public.voxora_leads l
    where l.assigned_agent_id=a.id
  ) tc on true
  where a.status='active' and a.can_receive_leads and a.role in ('sales','manager')
  order by pc.c asc, tc.c asc, a.created_at asc, a.id asc
  limit 1;
$$;

create or replace function public.voxora_ensure_lead(
  p_raw_phone text,
  p_listing_id uuid default null,
  p_user_id uuid default null,
  p_business_name text default '',
  p_customer_name text default '',
  p_source text default 'admin'
)
returns public.voxora_leads
language plpgsql
as $$
declare
  v_phone text;
  v_prefix text;
  v_agent uuid;
  v_lead public.voxora_leads;
begin
  v_phone := public.voxora_normalize_egypt_phone(p_raw_phone);
  if v_phone is null then
    raise exception 'invalid_egypt_mobile';
  end if;
  v_prefix := left(v_phone,3);

  select * into v_lead from public.voxora_leads where normalized_phone=v_phone;
  if found then
    update public.voxora_leads
      set raw_phone=coalesce(nullif(p_raw_phone,''),raw_phone),
          daleely_listing_id=coalesce(p_listing_id,daleely_listing_id),
          daleely_user_id=coalesce(p_user_id,daleely_user_id),
          business_name=case when coalesce(p_business_name,'')<>'' then p_business_name else business_name end,
          customer_name=case when coalesce(p_customer_name,'')<>'' then p_customer_name else customer_name end,
          updated_at=now()
      where id=v_lead.id
      returning * into v_lead;
    return v_lead;
  end if;

  v_agent := public.voxora_pick_sales_agent(v_prefix);
  insert into public.voxora_leads(
    raw_phone, normalized_phone, prefix, daleely_listing_id, daleely_user_id,
    business_name, customer_name, status, assigned_agent_id, original_agent_id, source
  ) values (
    p_raw_phone, v_phone, v_prefix, p_listing_id, p_user_id,
    coalesce(p_business_name,''), coalesce(p_customer_name,''),
    case when v_agent is null then 'new' else 'assigned' end,
    v_agent, v_agent, coalesce(nullif(p_source,''),'admin')
  ) returning * into v_lead;

  insert into public.voxora_timeline_events(lead_id,type,actor_type,title,data)
  values(v_lead.id,'lead_created','system','تمت إضافة العميل تلقائيًا لمسار المبيعات',jsonb_build_object('source',p_source,'prefix',v_prefix));

  return v_lead;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3) Safe Daleely mutations
-- -----------------------------------------------------------------------------

create or replace function public.voxora_link_listing_owner(
  p_listing_id uuid,
  p_user_id uuid,
  p_phone text,
  p_method text default 'manual',
  p_confidence int default 100,
  p_reason text default 'owner_verified',
  p_actor_type text default 'admin',
  p_actor_id text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_before public.listings;
  v_after public.listings;
  v_phone text;
begin
  select * into v_before from public.listings where id=p_listing_id for update;
  if not found then raise exception 'listing_not_found'; end if;
  if v_before.owner_id is not null and v_before.owner_id<>p_user_id then
    raise exception 'listing_owned_by_other_user';
  end if;

  v_phone := public.voxora_normalize_egypt_phone(p_phone);
  if v_phone is null then raise exception 'invalid_phone'; end if;

  update public.listings
  set owner_id=p_user_id,
      user_id=p_user_id,
      is_claimed=true,
      claimed_at=coalesce(claimed_at,now()),
      updated_at=now()
  where id=p_listing_id
  returning * into v_after;

  insert into public.voxora_owner_link_events(
    daleely_listing_id,daleely_user_id,phone_normalized,method,confidence,reason,actor_type,actor_id,status
  ) values(p_listing_id,p_user_id,v_phone,p_method,p_confidence,p_reason,p_actor_type,p_actor_id,'linked');

  update public.voxora_leads
    set daleely_user_id=p_user_id, daleely_listing_id=p_listing_id, status='linked', last_outcome='linked', updated_at=now()
  where normalized_phone=v_phone;

  insert into public.voxora_audit_logs(actor_type,actor_id,action,entity_type,entity_id,old_value,new_value,reason,source)
  values(p_actor_type,p_actor_id,'ownership.linked','listing',p_listing_id::text,
    jsonb_build_object('owner_id',v_before.owner_id,'user_id',v_before.user_id,'is_claimed',v_before.is_claimed),
    jsonb_build_object('owner_id',p_user_id,'user_id',p_user_id,'is_claimed',true),p_reason,'voxora');

  insert into public.notifications(recipient_user_id,title,body,notification_type,entity_type,entity_id,metadata)
  values(p_user_id,'تم ربط نشاطك بنجاح','تم ربط نشاطك بحسابك بنجاح وتم تحديث بيانات النشاط','system','listing',p_listing_id,
    jsonb_build_object('source','voxora','event','ownership_linked'));

  return jsonb_build_object('ok',true,'listing_id',p_listing_id,'user_id',p_user_id,'normalized_phone',v_phone);
end;
$$;

create or replace function public.voxora_confirm_listing_status(
  p_listing_id uuid,
  p_status text,
  p_reason text,
  p_confidence int default 100,
  p_source text default 'call_confirmation',
  p_actor_type text default 'admin',
  p_actor_id text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_before public.listings;
  v_hide boolean;
begin
  if p_status not in ('invalid_phone','out_of_service','wrong_business_phone','closed_business','busy','no_answer','switched_off') then
    raise exception 'unsupported_status';
  end if;

  select * into v_before from public.listings where id=p_listing_id for update;
  if not found then raise exception 'listing_not_found'; end if;

  v_hide := p_status in ('invalid_phone','out_of_service','wrong_business_phone','closed_business') and p_confidence>=80;

  insert into public.voxora_listing_state(
    daleely_listing_id,ops_status,phone_status,previous_is_visible,previous_hidden_reason,previous_status,reason,source,confidence,last_verified_at,updated_at
  ) values(
    p_listing_id,case when v_hide then p_status else 'active' end,p_status,v_before.is_visible,v_before.hidden_reason,v_before.status,
    p_reason,p_source,p_confidence,now(),now()
  ) on conflict(daleely_listing_id) do update set
    ops_status=excluded.ops_status, phone_status=excluded.phone_status,
    previous_is_visible=case when public.voxora_listing_state.previous_is_visible is null then excluded.previous_is_visible else public.voxora_listing_state.previous_is_visible end,
    previous_hidden_reason=case when public.voxora_listing_state.previous_is_visible is null then excluded.previous_hidden_reason else public.voxora_listing_state.previous_hidden_reason end,
    previous_status=case when public.voxora_listing_state.previous_is_visible is null then excluded.previous_status else public.voxora_listing_state.previous_status end,
    reason=excluded.reason,source=excluded.source,confidence=excluded.confidence,last_verified_at=excluded.last_verified_at,updated_at=now();

  if v_hide then
    update public.listings
      set is_visible=false,
          hidden_reason='voxora:'||p_status||':'||coalesce(p_reason,''),
          updated_at=now()
    where id=p_listing_id;
  end if;

  insert into public.voxora_audit_logs(actor_type,actor_id,action,entity_type,entity_id,old_value,new_value,reason,source,metadata)
  values(p_actor_type,p_actor_id,'listing.status_confirmed','listing',p_listing_id::text,
    jsonb_build_object('is_visible',v_before.is_visible,'hidden_reason',v_before.hidden_reason),
    jsonb_build_object('ops_status',p_status,'hidden',v_hide),p_reason,p_source,
    jsonb_build_object('confidence',p_confidence,'reversible',true));

  return jsonb_build_object('ok',true,'hidden',v_hide,'status',p_status,'listing_id',p_listing_id);
end;
$$;

create or replace function public.voxora_restore_listing(p_listing_id uuid,p_actor_id text default null)
returns jsonb
language plpgsql
as $$
declare
  v_state public.voxora_listing_state;
begin
  select * into v_state from public.voxora_listing_state where daleely_listing_id=p_listing_id for update;
  if not found then raise exception 'no_voxora_state'; end if;

  update public.listings set
    is_visible=coalesce(v_state.previous_is_visible,true),
    hidden_reason=v_state.previous_hidden_reason,
    updated_at=now()
  where id=p_listing_id;

  update public.voxora_listing_state set ops_status='active',reason='restored_by_admin',updated_at=now() where daleely_listing_id=p_listing_id;
  insert into public.voxora_audit_logs(actor_type,actor_id,action,entity_type,entity_id,new_value,source)
  values('admin',p_actor_id,'listing.restored','listing',p_listing_id::text,jsonb_build_object('restored',true),'voxora');
  return jsonb_build_object('ok',true,'listing_id',p_listing_id);
end;
$$;

-- Safe merge: canonical keeps populated fields; missing fields/images are enriched from duplicate.
create or replace function public.voxora_merge_listings(
  p_canonical_id uuid,
  p_duplicate_id uuid,
  p_confidence int,
  p_reasons jsonb default '[]'::jsonb,
  p_actor_id text default null
)
returns jsonb
language plpgsql
as $$
declare
  c public.listings;
  d public.listings;
  v_owner uuid;
  v_changes jsonb := '[]'::jsonb;
  v_can_images jsonb;
  v_dup_images jsonb;
  v_merged_images jsonb;
begin
  if p_canonical_id=p_duplicate_id then raise exception 'same_listing'; end if;
  select * into c from public.listings where id=p_canonical_id for update;
  select * into d from public.listings where id=p_duplicate_id for update;
  if c.id is null or d.id is null then raise exception 'listing_not_found'; end if;

  v_can_images := coalesce(c.images,'[]'::jsonb);
  v_dup_images := coalesce(d.images,'[]'::jsonb);
  select coalesce(jsonb_agg(distinct x),'[]'::jsonb) into v_merged_images
  from jsonb_array_elements(v_can_images || v_dup_images) x;

  update public.listings set
    description=coalesce(nullif(c.description,''),d.description),
    address=coalesce(nullif(c.address,''),d.address),
    phone=coalesce(nullif(c.phone,''),d.phone),
    whatsapp=case when coalesce(c.whatsapp,'')='' then d.whatsapp else c.whatsapp end,
    email=coalesce(nullif(c.email,''),d.email),
    website=coalesce(nullif(c.website,''),d.website),
    facebook_url=coalesce(nullif(c.facebook_url,''),d.facebook_url),
    instagram_url=coalesce(nullif(c.instagram_url,''),d.instagram_url),
    tiktok_url=coalesce(nullif(c.tiktok_url,''),d.tiktok_url),
    youtube_url=coalesce(nullif(c.youtube_url,''),d.youtube_url),
    x_url=coalesce(nullif(c.x_url,''),d.x_url),
    snapchat_url=coalesce(nullif(c.snapchat_url,''),d.snapchat_url),
    map_url=coalesce(nullif(c.map_url,''),d.map_url),
    work_hours=coalesce(nullif(c.work_hours,''),d.work_hours),
    services=coalesce(nullif(c.services,''),d.services),
    image_url=coalesce(nullif(c.image_url,''),d.image_url),
    cover_url=coalesce(nullif(c.cover_url,''),d.cover_url),
    logo_url=coalesce(nullif(c.logo_url,''),d.logo_url),
    main_image_url=coalesce(nullif(c.main_image_url,''),d.main_image_url),
    images=v_merged_images,
    gallery=(select coalesce(jsonb_agg(distinct x),'[]'::jsonb) from jsonb_array_elements(coalesce(c.gallery,'[]'::jsonb)||coalesce(d.gallery,'[]'::jsonb)) x),
    updated_at=now()
  where id=p_canonical_id;

  v_owner := coalesce(c.owner_id,c.user_id,d.owner_id,d.user_id,d.submitted_by_id);
  if v_owner is not null and c.owner_id is null and c.user_id is null then
    update public.listings set owner_id=v_owner,user_id=v_owner,is_claimed=true,claimed_at=coalesce(claimed_at,now()),updated_at=now() where id=p_canonical_id;
  end if;

  insert into public.voxora_listing_state(daleely_listing_id,ops_status,previous_is_visible,previous_hidden_reason,previous_status,reason,source,confidence,last_verified_at)
  values(p_duplicate_id,'merged',d.is_visible,d.hidden_reason,d.status,'duplicate_merged','duplicate_merge',p_confidence,now())
  on conflict(daleely_listing_id) do update set ops_status='merged',reason='duplicate_merged',source='duplicate_merge',confidence=p_confidence,last_verified_at=now(),updated_at=now();

  update public.listings set is_visible=false,hidden_reason='voxora:merged_into:'||p_canonical_id::text,updated_at=now() where id=p_duplicate_id;

  insert into public.voxora_merge_jobs(
    canonical_listing_id,duplicate_listing_id,confidence,reasons,status,canonical_before,duplicate_before,field_changes,reviewed_at
  ) values(p_canonical_id,p_duplicate_id,p_confidence,coalesce(p_reasons,'[]'::jsonb),'merged',to_jsonb(c),to_jsonb(d),v_changes,now())
  on conflict(canonical_listing_id,duplicate_listing_id) do update set
    confidence=excluded.confidence,reasons=excluded.reasons,status='merged',canonical_before=excluded.canonical_before,
    duplicate_before=excluded.duplicate_before,reviewed_at=now();

  insert into public.voxora_audit_logs(actor_type,actor_id,action,entity_type,entity_id,old_value,new_value,reason,source,metadata)
  values('admin',p_actor_id,'merge.merged','listing',p_duplicate_id::text,to_jsonb(d),jsonb_build_object('canonical_listing_id',p_canonical_id),
    'duplicate_merged','merge_review',jsonb_build_object('confidence',p_confidence,'reversible',true));

  if v_owner is not null then
    insert into public.notifications(recipient_user_id,title,body,notification_type,entity_type,entity_id,metadata)
    values(v_owner,'تم ربط نشاطك بنجاح','تم ربط نشاطك بحسابك بنجاح وتم تحديث بيانات النشاط','system','listing',p_canonical_id,
      jsonb_build_object('source','voxora','event','duplicate_merged_and_linked','duplicate_listing_id',p_duplicate_id));
  end if;

  return jsonb_build_object('ok',true,'canonical_listing_id',p_canonical_id,'duplicate_listing_id',p_duplicate_id,'owner_id',v_owner);
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Automatic Sales entry for future unclaimed/admin-added listings
-- -----------------------------------------------------------------------------

create schema if not exists voxora_private;
revoke all on schema voxora_private from public, anon, authenticated;

create or replace function voxora_private.sync_listing_to_sales()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text;
  v_profile_user uuid;
  v_customer_name text;
begin
  v_phone := public.voxora_normalize_egypt_phone(new.phone);
  if v_phone is null then return new; end if;

  -- If a listing becomes claimed, reflect that in the existing lead and stop here.
  if new.owner_id is not null or new.user_id is not null or coalesce(new.is_claimed,false)=true then
    update public.voxora_leads set
      daleely_listing_id=new.id,
      daleely_user_id=coalesce(new.owner_id,new.user_id),
      business_name=new.name,
      status='linked',
      last_outcome='linked',
      updated_at=now()
    where normalized_phone=v_phone;
    return new;
  end if;

  -- Auto-enqueue only unclaimed records; this covers admin-imported/new directory data.
  select p.user_id,coalesce(p.full_name,p.name,'') into v_profile_user,v_customer_name
  from public.user_profiles p
  where public.voxora_normalize_egypt_phone(p.phone)=v_phone
  order by p.updated_at desc
  limit 1;

  perform public.voxora_ensure_lead(new.phone,new.id,v_profile_user,new.name,coalesce(v_customer_name,''),'daleely_listing');
  return new;
end;
$$;
revoke all on function voxora_private.sync_listing_to_sales() from public, anon, authenticated;

-- Only create the trigger once.
drop trigger if exists voxora_listing_sales_sync on public.listings;
create trigger voxora_listing_sales_sync
after insert or update of phone,owner_id,user_id,is_claimed,name on public.listings
for each row execute function voxora_private.sync_listing_to_sales();

-- -----------------------------------------------------------------------------
-- 5) Updated-at helpers
-- -----------------------------------------------------------------------------
create or replace function voxora_private.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
revoke all on function voxora_private.touch_updated_at() from public, anon, authenticated;

drop trigger if exists voxora_agents_touch on public.voxora_sales_agents;
create trigger voxora_agents_touch before update on public.voxora_sales_agents for each row execute function voxora_private.touch_updated_at();
drop trigger if exists voxora_leads_touch on public.voxora_leads;
create trigger voxora_leads_touch before update on public.voxora_leads for each row execute function voxora_private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 6) Security: no direct browser access. Server secret / service_role only.
-- -----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'voxora_sales_agents','voxora_leads','voxora_call_attempts','voxora_followups','voxora_bot_queue',
    'voxora_whatsapp_threads','voxora_whatsapp_messages','voxora_timeline_events','voxora_audit_logs',
    'voxora_owner_link_events','voxora_listing_state','voxora_merge_jobs','voxora_internal_notifications'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from anon, authenticated',t);
    execute format('grant select,insert,update,delete on table public.%I to service_role',t);
  end loop;
end $$;

-- RPCs are server-only. Modern Supabase secret keys map to the elevated server role.
revoke all on function public.voxora_normalize_egypt_phone(text) from public, anon, authenticated;
revoke all on function public.voxora_pick_sales_agent(text) from public, anon, authenticated;
revoke all on function public.voxora_ensure_lead(text,uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.voxora_link_listing_owner(uuid,uuid,text,text,int,text,text,text) from public, anon, authenticated;
revoke all on function public.voxora_confirm_listing_status(uuid,text,text,int,text,text,text) from public, anon, authenticated;
revoke all on function public.voxora_restore_listing(uuid,text) from public, anon, authenticated;
revoke all on function public.voxora_merge_listings(uuid,uuid,int,jsonb,text) from public, anon, authenticated;

grant execute on function public.voxora_normalize_egypt_phone(text) to service_role;
grant execute on function public.voxora_pick_sales_agent(text) to service_role;
grant execute on function public.voxora_ensure_lead(text,uuid,uuid,text,text,text) to service_role;
grant execute on function public.voxora_link_listing_owner(uuid,uuid,text,text,int,text,text,text) to service_role;
grant execute on function public.voxora_confirm_listing_status(uuid,text,text,int,text,text,text) to service_role;
grant execute on function public.voxora_restore_listing(uuid,text) to service_role;
grant execute on function public.voxora_merge_listings(uuid,uuid,int,jsonb,text) to service_role;

-- -----------------------------------------------------------------------------
-- 7) Two current Sales seats; editable/removable later. Do not hardcode their names.
-- -----------------------------------------------------------------------------
insert into public.voxora_sales_agents(code,name,role,status,can_receive_leads)
values
  ('sales-1','موظفة مبيعات 1','sales','active',true),
  ('sales-2','موظفة مبيعات 2','sales','active',true)
on conflict(code) do nothing;

commit;
