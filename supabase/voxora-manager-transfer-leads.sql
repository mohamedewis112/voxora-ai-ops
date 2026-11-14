-- Manager-only atomic lead transfer for Voxora Sales.
-- Existing auth and lead auto-distribution are intentionally unchanged.

create or replace function public.voxora_manager_transfer_leads(
  p_app_key text,
  p_manager_id uuid,
  p_manager_name text,
  p_lead_ids uuid[],
  p_new_agent_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_manager public.admins%rowtype;
  v_manager_credential public.voxora_manager_credentials%rowtype;
  v_target public.voxora_sales_agents%rowtype;
  v_lead public.voxora_leads%rowtype;
  v_previous_name text;
  v_manager_name text;
  v_ids uuid[];
  v_requested_count integer;
  v_unassigned_count integer;
  v_transferred_count integer := 0;
  v_skipped_count integer := 0;
  v_followups_count integer := 0;
  v_transferred_ids uuid[] := '{}'::uuid[];
  v_transferred_at timestamptz := clock_timestamp();
begin
  if not voxora_private.verify_sales_app_key(p_app_key) then
    raise exception 'unauthorized';
  end if;

  select *
    into v_manager
    from public.admins
    where id = p_manager_id
      and is_active = true
    limit 1;

  if v_manager.id is not null then
    v_manager_name := coalesce(nullif(v_manager.name, ''), nullif(p_manager_name, ''), 'المدير');
  else
    select *
      into v_manager_credential
      from public.voxora_manager_credentials
      where id = p_manager_id
        and active = true
      limit 1;

    if v_manager_credential.id is null then
      raise exception 'forbidden';
    end if;

    v_manager_name := coalesce(
      nullif(v_manager_credential.name, ''),
      nullif(p_manager_name, ''),
      'المدير'
    );
  end if;

  if p_lead_ids is null or cardinality(p_lead_ids) = 0 then
    raise exception 'missing_leads';
  end if;

  if p_new_agent_id is null then
    raise exception 'missing_target_agent';
  end if;

  select *
    into v_target
    from public.voxora_sales_agents
    where id = p_new_agent_id
    limit 1;

  if v_target.id is null then
    raise exception 'target_agent_not_found';
  end if;

  if v_target.status <> 'active' then
    raise exception 'target_agent_inactive';
  end if;

  if not coalesce(v_target.can_receive_leads, false) then
    raise exception 'target_agent_cannot_receive_leads';
  end if;

  select array_agg(distinct lead_id)
    into v_ids
    from unnest(p_lead_ids) as requested(lead_id)
    where lead_id is not null;

  if v_ids is null or cardinality(v_ids) = 0 then
    raise exception 'missing_leads';
  end if;

  perform l.id
    from public.voxora_leads as l
    where l.id = any(v_ids)
    order by l.id
    for update;

  select count(*),
         count(*) filter (where assigned_agent_id is null)
    into v_requested_count, v_unassigned_count
    from public.voxora_leads
    where id = any(v_ids);

  if v_requested_count <> cardinality(v_ids) then
    raise exception 'lead_not_found';
  end if;

  if v_unassigned_count > 0 then
    raise exception 'lead_unassigned';
  end if;

  for v_lead in
    select *
      from public.voxora_leads
      where id = any(v_ids)
      order by id
  loop
    if v_lead.assigned_agent_id = p_new_agent_id then
      v_skipped_count := v_skipped_count + 1;
      continue;
    end if;

    select name
      into v_previous_name
      from public.voxora_sales_agents
      where id = v_lead.assigned_agent_id;

    update public.voxora_leads
      set assigned_agent_id = p_new_agent_id,
          updated_at = v_transferred_at
      where id = v_lead.id;

    update public.voxora_followups
      set assignee_id = p_new_agent_id
      where lead_id = v_lead.id
        and completed_at is null
        and status in ('scheduled', 'due', 'rescheduled');

    get diagnostics v_followups_count = row_count;

    insert into public.voxora_timeline_events(
      lead_id,
      type,
      actor_type,
      actor_id,
      actor_name,
      title,
      data,
      created_at
    ) values (
      v_lead.id,
      'lead_transferred',
      'admin',
      p_manager_id::text,
      v_manager_name,
      'تم نقل العميل من ' || coalesce(v_previous_name, 'موظفة سابقة') || ' إلى ' || v_target.name || ' بواسطة المدير',
      jsonb_build_object(
        'previous_agent_id', v_lead.assigned_agent_id,
        'previous_agent_name', v_previous_name,
        'new_agent_id', v_target.id,
        'new_agent_name', v_target.name,
        'manager', jsonb_build_object('id', p_manager_id, 'name', v_manager_name),
        'reason', nullif(trim(coalesce(p_reason, '')), ''),
        'transferred_at', v_transferred_at,
        'followups_reassigned', v_followups_count
      ),
      v_transferred_at
    );

    insert into public.voxora_audit_logs(
      actor_type,
      actor_id,
      action,
      entity_type,
      entity_id,
      old_value,
      new_value,
      reason,
      source,
      metadata,
      created_at
    ) values (
      'admin',
      p_manager_id::text,
      'lead.transfer',
      'lead',
      v_lead.id::text,
      jsonb_build_object(
        'assigned_agent_id', v_lead.assigned_agent_id,
        'assigned_agent_name', v_previous_name
      ),
      jsonb_build_object(
        'assigned_agent_id', v_target.id,
        'assigned_agent_name', v_target.name
      ),
      nullif(trim(coalesce(p_reason, '')), ''),
      'manager_transfer',
      jsonb_build_object(
        'previous_agent_id', v_lead.assigned_agent_id,
        'previous_agent_name', v_previous_name,
        'new_agent_id', v_target.id,
        'new_agent_name', v_target.name,
        'manager', jsonb_build_object('id', p_manager_id, 'name', v_manager_name),
        'transferred_at', v_transferred_at,
        'followups_reassigned', v_followups_count
      ),
      v_transferred_at
    );

    v_transferred_count := v_transferred_count + 1;
    v_transferred_ids := array_append(v_transferred_ids, v_lead.id);
  end loop;

  if v_transferred_count = 0 then
    raise exception 'same_agent';
  end if;

  return jsonb_build_object(
    'transferredCount', v_transferred_count,
    'skippedCount', v_skipped_count,
    'newAgentId', v_target.id,
    'newAgentName', v_target.name,
    'transferredLeadIds', to_jsonb(v_transferred_ids)
  );
end;
$$;

revoke all on function public.voxora_manager_transfer_leads(text,uuid,text,uuid[],uuid,text)
  from public, anon, authenticated;
grant execute on function public.voxora_manager_transfer_leads(text,uuid,text,uuid[],uuid,text)
  to anon, service_role;
