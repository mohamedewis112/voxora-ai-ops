-- Voxora AI — extensions applied after voxora-production.sql
-- Safe/idempotent changes for the EXISTING Daleely Supabase project.
-- No Daleely table is dropped or renamed.

begin;

-- One lead (phone/person) may legitimately relate to multiple activities.
create table if not exists public.voxora_lead_listings (
  lead_id uuid not null references public.voxora_leads(id) on delete cascade,
  daleely_listing_id uuid not null references public.listings(id) on delete cascade,
  relation_type text not null default 'phone_match'
    check (relation_type in ('phone_match','owner_match','manual','duplicate_candidate')),
  confidence int not null default 100,
  created_at timestamptz not null default now(),
  primary key (lead_id,daleely_listing_id)
);
alter table public.voxora_lead_listings enable row level security;
revoke all on table public.voxora_lead_listings from anon, authenticated;
grant select,insert,update,delete on table public.voxora_lead_listings to service_role;

-- Harden search_path for server-only functions.
alter function public.voxora_normalize_egypt_phone(text) set search_path = public, pg_temp;
alter function public.voxora_pick_sales_agent(text) set search_path = public, pg_temp;
alter function public.voxora_link_listing_owner(uuid,uuid,text,text,int,text,text,text) set search_path = public, pg_temp;
alter function public.voxora_confirm_listing_status(uuid,text,text,int,text,text,text) set search_path = public, pg_temp;
alter function public.voxora_restore_listing(uuid,text) set search_path = public, pg_temp;
alter function voxora_private.touch_updated_at() set search_path = public, pg_temp;

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
set search_path = public, pg_temp
as $$
declare
  v_phone text;
  v_prefix text;
  v_agent uuid;
  v_lead public.voxora_leads;
begin
  v_phone := public.voxora_normalize_egypt_phone(p_raw_phone);
  if v_phone is null then raise exception 'invalid_egypt_mobile'; end if;
  v_prefix := left(v_phone,3);

  select * into v_lead from public.voxora_leads where normalized_phone=v_phone;
  if found then
    update public.voxora_leads
      set raw_phone=coalesce(nullif(p_raw_phone,''),raw_phone),
          daleely_listing_id=coalesce(daleely_listing_id,p_listing_id),
          daleely_user_id=coalesce(daleely_user_id,p_user_id),
          business_name=case
            when coalesce(business_name,'')='' and coalesce(p_business_name,'')<>'' then p_business_name
            else business_name end,
          customer_name=case when coalesce(p_customer_name,'')<>'' then p_customer_name else customer_name end,
          updated_at=now()
      where id=v_lead.id
      returning * into v_lead;

    if p_listing_id is not null then
      insert into public.voxora_lead_listings(lead_id,daleely_listing_id,relation_type,confidence)
      values(v_lead.id,p_listing_id,'phone_match',100)
      on conflict(lead_id,daleely_listing_id) do nothing;
    end if;
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

  if p_listing_id is not null then
    insert into public.voxora_lead_listings(lead_id,daleely_listing_id,relation_type,confidence)
    values(v_lead.id,p_listing_id,'phone_match',100)
    on conflict(lead_id,daleely_listing_id) do nothing;
  end if;

  insert into public.voxora_timeline_events(lead_id,type,actor_type,title,data)
  values(v_lead.id,'lead_created','system','تمت إضافة العميل تلقائيًا لمسار المبيعات',
         jsonb_build_object('source',p_source,'prefix',v_prefix));
  return v_lead;
end;
$$;
revoke all on function public.voxora_ensure_lead(text,uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.voxora_ensure_lead(text,uuid,uuid,text,text,text) to service_role;

create or replace function voxora_private.normalize_business_name(p_name text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select lower(regexp_replace(regexp_replace(coalesce(p_name,''),'[[:space:]_.،,-]+','','g'),'^(ال)',''));
$$;
revoke all on function voxora_private.normalize_business_name(text) from public, anon, authenticated;

-- Final safe merge implementation. Filled canonical fields stay authoritative;
-- missing fields/images may be enriched from the duplicate. Duplicate is hidden, never hard-deleted.
create or replace function public.voxora_merge_listings(
  p_canonical_id uuid,
  p_duplicate_id uuid,
  p_confidence int,
  p_reasons jsonb default '[]'::jsonb,
  p_actor_id text default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  c public.listings;
  d public.listings;
  v_owner uuid;
  v_changes jsonb := '[]'::jsonb;
  v_can_images jsonb;
  v_dup_images jsonb;
  v_merged_images jsonb;
  v_phone text;
  v_lead uuid;
begin
  if p_canonical_id=p_duplicate_id then raise exception 'same_listing'; end if;
  select * into c from public.listings where id=p_canonical_id for update;
  select * into d from public.listings where id=p_duplicate_id for update;
  if c.id is null or d.id is null then raise exception 'listing_not_found'; end if;

  v_can_images := case when jsonb_typeof(coalesce(c.images,'[]'::jsonb))='array' then coalesce(c.images,'[]'::jsonb) else '[]'::jsonb end;
  v_dup_images := case when jsonb_typeof(coalesce(d.images,'[]'::jsonb))='array' then coalesce(d.images,'[]'::jsonb) else '[]'::jsonb end;
  select coalesce(jsonb_agg(distinct x),'[]'::jsonb)
    into v_merged_images
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
    gallery=(
      select coalesce(jsonb_agg(distinct x),'[]'::jsonb)
      from jsonb_array_elements(
        (case when jsonb_typeof(coalesce(c.gallery,'[]'::jsonb))='array' then coalesce(c.gallery,'[]'::jsonb) else '[]'::jsonb end) ||
        (case when jsonb_typeof(coalesce(d.gallery,'[]'::jsonb))='array' then coalesce(d.gallery,'[]'::jsonb) else '[]'::jsonb end)
      ) x
    ),
    updated_at=now()
  where id=p_canonical_id;

  v_owner := coalesce(c.owner_id,c.user_id,d.owner_id,d.user_id,d.submitted_by_id);
  if v_owner is not null and c.owner_id is null and c.user_id is null then
    update public.listings
      set owner_id=v_owner,user_id=v_owner,is_claimed=true,
          claimed_at=coalesce(claimed_at,now()),updated_at=now()
    where id=p_canonical_id;
  end if;

  insert into public.voxora_listing_state(
    daleely_listing_id,ops_status,previous_is_visible,previous_hidden_reason,previous_status,
    reason,source,confidence,last_verified_at
  ) values(
    p_duplicate_id,'merged',d.is_visible,d.hidden_reason,d.status,
    'duplicate_merged','duplicate_merge',p_confidence,now()
  ) on conflict(daleely_listing_id) do update set
    ops_status='merged',reason='duplicate_merged',source='duplicate_merge',
    confidence=p_confidence,last_verified_at=now(),updated_at=now();

  update public.listings
    set is_visible=false,
        hidden_reason='voxora:merged_into:'||p_canonical_id::text,
        updated_at=now()
  where id=p_duplicate_id;

  insert into public.voxora_merge_jobs(
    canonical_listing_id,duplicate_listing_id,confidence,reasons,status,
    canonical_before,duplicate_before,field_changes,reviewed_at
  ) values(
    p_canonical_id,p_duplicate_id,p_confidence,coalesce(p_reasons,'[]'::jsonb),'merged',
    to_jsonb(c),to_jsonb(d),v_changes,now()
  ) on conflict(canonical_listing_id,duplicate_listing_id) do update set
    confidence=excluded.confidence,reasons=excluded.reasons,status='merged',
    canonical_before=excluded.canonical_before,duplicate_before=excluded.duplicate_before,
    reviewed_at=now();

  v_phone := coalesce(public.voxora_normalize_egypt_phone(c.phone), public.voxora_normalize_egypt_phone(d.phone));
  if v_phone is not null then
    select id into v_lead from public.voxora_leads where normalized_phone=v_phone limit 1;
    if v_lead is not null then
      update public.voxora_leads set
        daleely_listing_id=p_canonical_id,
        daleely_user_id=coalesce(v_owner,daleely_user_id),
        status=case when v_owner is not null then 'linked' else status end,
        last_outcome=case when v_owner is not null then 'linked' else last_outcome end,
        updated_at=now()
      where id=v_lead;
      insert into public.voxora_lead_listings(lead_id,daleely_listing_id,relation_type,confidence)
      values(v_lead,p_canonical_id,'duplicate_candidate',p_confidence)
      on conflict(lead_id,daleely_listing_id) do update set
        confidence=greatest(public.voxora_lead_listings.confidence,excluded.confidence);
    end if;
  end if;

  insert into public.voxora_audit_logs(
    actor_type,actor_id,action,entity_type,entity_id,old_value,new_value,reason,source,metadata
  ) values(
    'admin',p_actor_id,'merge.merged','listing',p_duplicate_id::text,to_jsonb(d),
    jsonb_build_object('canonical_listing_id',p_canonical_id),'duplicate_merged','merge_review',
    jsonb_build_object('confidence',p_confidence,'reversible',true)
  );

  if v_owner is not null then
    insert into public.notifications(
      recipient_user_id,title,body,notification_type,entity_type,entity_id,metadata
    ) values(
      v_owner,'تم ربط نشاطك بنجاح','تم ربط نشاطك بحسابك بنجاح وتم تحديث بيانات النشاط',
      'system','listing',p_canonical_id,
      jsonb_build_object('source','voxora','event','duplicate_merged_and_linked','duplicate_listing_id',p_duplicate_id)
    );
  end if;

  return jsonb_build_object(
    'ok',true,'canonical_listing_id',p_canonical_id,
    'duplicate_listing_id',p_duplicate_id,'owner_id',v_owner
  );
end;
$$;
revoke all on function public.voxora_merge_listings(uuid,uuid,int,jsonb,text) from public, anon, authenticated;
grant execute on function public.voxora_merge_listings(uuid,uuid,int,jsonb,text) to service_role;

-- Conservative automatic duplicate detector:
-- only exact normalized phone + exact normalized name auto-merges.
-- same name+area without phone becomes review only.
create or replace function voxora_private.detect_listing_duplicate()
returns trigger
language plpgsql
security definer
set search_path = public, voxora_private, pg_temp
as $$
declare
  v_phone text;
  v_name text;
  v_exact public.listings;
  v_review public.listings;
begin
  if coalesce(new.is_deleted,false)=true or new.deleted_at is not null then return new; end if;
  v_phone := public.voxora_normalize_egypt_phone(new.phone);
  v_name := voxora_private.normalize_business_name(new.name);

  if v_phone is not null and v_name<>'' then
    select l.* into v_exact
    from public.listings l
    where l.id<>new.id
      and coalesce(l.is_deleted,false)=false and l.deleted_at is null
      and public.voxora_normalize_egypt_phone(l.phone)=v_phone
      and voxora_private.normalize_business_name(l.name)=v_name
    order by l.created_at asc
    limit 1;

    if found then
      perform public.voxora_merge_listings(
        v_exact.id,new.id,100,
        jsonb_build_array(jsonb_build_object('code','exact_phone_name','label','نفس الهاتف والاسم','score',100)),
        'system_duplicate_detector'
      );
      return new;
    end if;
  end if;

  if v_name<>'' then
    select l.* into v_review
    from public.listings l
    where l.id<>new.id
      and coalesce(l.is_deleted,false)=false and l.deleted_at is null
      and voxora_private.normalize_business_name(l.name)=v_name
      and coalesce(l.village,'')=coalesce(new.village,'')
      and coalesce(l.center,l.city,'')=coalesce(new.center,new.city,'')
    order by l.created_at asc
    limit 1;

    if found then
      insert into public.voxora_merge_jobs(
        canonical_listing_id,duplicate_listing_id,confidence,reasons,status,
        canonical_before,duplicate_before
      ) values(
        v_review.id,new.id,70,
        jsonb_build_array(jsonb_build_object('code','same_name_area','label','نفس الاسم والمنطقة','score',70)),
        'pending_review',to_jsonb(v_review),to_jsonb(new)
      ) on conflict(canonical_listing_id,duplicate_listing_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function voxora_private.detect_listing_duplicate() from public, anon, authenticated;

drop trigger if exists voxora_listing_duplicate_check on public.listings;
create trigger voxora_listing_duplicate_check
  after insert on public.listings
  for each row execute function voxora_private.detect_listing_duplicate();

commit;
