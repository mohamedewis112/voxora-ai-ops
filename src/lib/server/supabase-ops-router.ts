import { daleelyRest, daleelyRpc } from "@/integrations/daleely/supabase-server";
import { normalizePhone } from "./phone";
import type { VoxoraActor } from "./voxora-auth";
import type {
  LeadDTO, ListingDTO, TimelineEventDTO, AuditLogDTO, MergeJobDTO, BotQueueDTO,
  WhatsAppThreadDTO, WhatsAppMessageDTO, DistributionRowDTO, PerformanceRowDTO, OpsOverviewDTO,
} from "@/lib/ops-types";

type Json = Record<string, unknown>;
type Row = Record<string, any>;
const ok = (data: unknown) => Response.json({ ok: true, data });
const err = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

async function rows<T extends Row = Row>(path: string): Promise<T[]> {
  const r = await daleelyRest(path, { method: "GET", headers: { Prefer: "count=none" } });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`supabase_get_${r.status}:${JSON.stringify(data)}`);
  return (Array.isArray(data) ? data : []) as T[];
}
async function insert<T extends Row = Row>(table: string, data: Json, upsert = false): Promise<T> {
  const r = await daleelyRest(`${table}${upsert ? "?on_conflict=" + Object.keys(data)[0] : ""}`, {
    method: "POST",
    headers: { Prefer: upsert ? "return=representation,resolution=merge-duplicates" : "return=representation" },
    body: JSON.stringify(data),
  });
  const payload = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`supabase_insert_${table}_${r.status}:${JSON.stringify(payload)}`);
  return (Array.isArray(payload) ? payload[0] : payload) as T;
}
async function patch<T extends Row = Row>(table: string, filter: string, data: Json): Promise<T[]> {
  const r = await daleelyRest(`${table}?${filter}`, { method: "PATCH", body: JSON.stringify(data) });
  const payload = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`supabase_patch_${table}_${r.status}:${JSON.stringify(payload)}`);
  return (Array.isArray(payload) ? payload : []) as T[];
}
async function removeRows(table: string, filter: string) {
  const r = await daleelyRest(`${table}?${filter}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`supabase_delete_${table}_${r.status}`);
}
function qs(v: string) { return encodeURIComponent(v); }
function now() { return new Date().toISOString(); }
function arr<T>(v: unknown): T[] { return Array.isArray(v) ? v as T[] : []; }
function obj(v: unknown): Record<string, unknown> { return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {}; }
function canonPhone(raw: unknown) { const n = normalizePhone(String(raw || "")); return n.ok ? n.canonical : ""; }

function leadDTO(l: Row, agents?: Map<string, string>, listings?: Map<string, string>, registered?: Set<string>): LeadDTO {
  return {
    id: l.id, rawPhone: l.raw_phone, normalizedPhone: l.normalized_phone, prefix: l.prefix,
    listingId: l.daleely_listing_id, userId: l.daleely_user_id, businessName: l.business_name || "",
    customerName: l.customer_name || "", status: l.status, priority: l.priority,
    assignedAgentId: l.assigned_agent_id, originalAgentId: l.original_agent_id,
    botStatus: l.bot_status, source: l.source, campaign: l.campaign, lastOutcome: l.last_outcome,
    createdAt: l.created_at, updatedAt: l.updated_at,
    agentName: l.assigned_agent_id ? agents?.get(l.assigned_agent_id) ?? null : null,
    listingName: l.daleely_listing_id ? listings?.get(l.daleely_listing_id) ?? null : null,
    userRegistered: l.daleely_user_id ? registered?.has(l.daleely_user_id) ?? false : false,
  };
}
function listingDTO(l: Row, state?: Row, profile?: Row): ListingDTO {
  const rawImages = [...arr<string>(l.images), ...arr<string>(l.gallery), l.logo_url, l.main_image_url, l.image_url, l.cover_url]
    .filter((x): x is string => typeof x === "string" && !!x);
  const images = [...new Set(rawImages)];
  const mergedInto = typeof l.hidden_reason === "string" && l.hidden_reason.startsWith("voxora:merged_into:")
    ? l.hidden_reason.split("voxora:merged_into:")[1] : null;
  let status = state?.ops_status || (mergedInto ? "merged" : (!l.is_visible ? "hidden" : "active"));
  return {
    id: l.id, businessName: l.name || l.title || "", rawPhone: l.phone || "", normalizedPhone: canonPhone(l.phone),
    whatsapp: l.whatsapp || null, category: l.main_category || l.category || null, governorate: null,
    city: l.center || l.city || null, village: l.village || null, address: l.address || null,
    description: l.description || null, logo: l.logo_url || l.image_url || null, images,
    socialLinks: Object.fromEntries(Object.entries({ facebook: l.facebook_url || l.facebook, instagram: l.instagram_url, tiktok: l.tiktok_url, youtube: l.youtube_url, x: l.x_url, snapchat: l.snapchat_url, map: l.map_url }).filter(([,v]) => !!v)) as Record<string,string>,
    website: l.website || null, email: l.email || null, openingHours: l.work_hours || null, products: l.services || null,
    ownerUserId: l.owner_id || l.user_id || null, ownerPhoneNormalized: canonPhone(profile?.phone), status,
    canonicalListingId: mergedInto, createdAt: l.created_at, updatedAt: l.updated_at,
    ownerName: profile ? (profile.full_name || profile.name || null) : null,
    ownerRegistered: !!profile,
  };
}
function timelineDTO(e: Row): TimelineEventDTO { return { id:e.id,leadId:e.lead_id,type:e.type,actorType:e.actor_type,actorId:e.actor_id,actorName:e.actor_name,title:e.title,data:obj(e.data),createdAt:e.created_at }; }
function auditDTO(a: Row): AuditLogDTO { return { id:a.id,actorType:a.actor_type,actorId:a.actor_id,action:a.action,entityType:a.entity_type,entityId:a.entity_id,oldValue:obj(a.old_value),newValue:obj(a.new_value),reason:a.reason,source:a.source,metadata:obj(a.metadata),createdAt:a.created_at }; }

async function context() {
  const [agents, listings, profiles] = await Promise.all([
    rows("voxora_sales_agents?select=id,name,status,role&limit=500"),
    rows("listings?select=id,name&limit=5000"),
    rows("user_profiles?select=user_id&limit=5000"),
  ]);
  return {
    agents, agentNames:new Map<string,string>(agents.map(a=>[a.id,a.name])),
    listingNames:new Map<string,string>(listings.map(l=>[l.id,l.name || ""])),
    registered:new Set<string>(profiles.map(p=>p.user_id).filter(Boolean)),
  };
}
async function addTimeline(leadId:string,type:string,title:string,actor:VoxoraActor,data:Json={}) {
  await insert("voxora_timeline_events", { lead_id:leadId,type,actor_type:actor.type,actor_id:actor.id,actor_name:actor.name,title,data });
}
async function addAudit(actor:VoxoraActor, action:string, entityType:string, entityId:string|null, opts:{oldValue?:Json;newValue?:Json;reason?:string|null;source?:string|null;metadata?:Json}={}) {
  await insert("voxora_audit_logs", { actor_type:actor.type,actor_id:actor.id,action,entity_type:entityType,entity_id:entityId,old_value:opts.oldValue||{},new_value:opts.newValue||{},reason:opts.reason||null,source:opts.source||"voxora_web",metadata:opts.metadata||{} });
}
async function getLead(id:string) { return (await rows(`voxora_leads?select=*&id=eq.${qs(id)}&limit=1`))[0] || null; }
async function getListing(id:string) { return (await rows(`listings?select=*&id=eq.${qs(id)}&limit=1`))[0] || null; }
function canAccessLead(actor:VoxoraActor, lead:Row|null) {
  return !!lead && (actor.type==="admin" || lead.assigned_agent_id===actor.id);
}

export async function handleSupabaseOpsGet(path:string[], req:Request, actor:VoxoraActor):Promise<Response> {
  const url=new URL(req.url); const q=(url.searchParams.get("q")||"").trim().toLowerCase();
  const adminOnlyGet=new Set(["lookup","unclaimed","duplicates","bot-queue","audit","performance","listings"]);
  if(actor.type==="sales_agent" && adminOnlyGet.has(path[0])) return err("forbidden",403);

  if(path[0]==="overview" && actor.type==="sales_agent"){
    const [leads,threads,notifs]=await Promise.all([
      rows(`voxora_leads?select=id,prefix,status,assigned_agent_id&assigned_agent_id=eq.${qs(actor.id)}&limit=5000`),
      rows("voxora_whatsapp_threads?select=id,lead_id,unread_count&limit=5000"),
      rows(`voxora_internal_notifications?select=id,read&target_agent_id=eq.${qs(actor.id)}&limit=5000`)
    ]);
    const ids=new Set(leads.map(l=>l.id));
    const leadsByPrefix:Record<string,number>={}; const callStatusCounts:Record<string,number>={};
    for(const l of leads){ const p=l.prefix||"other"; leadsByPrefix[p]=(leadsByPrefix[p]||0)+1; callStatusCounts[l.status]=(callStatusCounts[l.status]||0)+1; }
    const counts={...leadsByPrefix};
    const data:OpsOverviewDTO={
      totalLeads:leads.length,leadsByPrefix,
      distribution:[{agentId:actor.id,agentName:actor.name,status:"active",counts,total:leads.length}],
      unclaimedCount:0,pendingMerges:0,botQueued:0,botRunning:0,
      whatsappUnread:threads.filter(t=>ids.has(t.lead_id)).reduce((s,t)=>s+(t.unread_count||0),0),
      callStatusCounts,invalidCount:leads.filter(l=>["invalid_number","out_of_service"].includes(l.status)).length,
      closedCount:leads.filter(l=>l.status==="closed_business").length,hiddenCount:0,
      notificationsUnread:notifs.filter(n=>!n.read).length
    };
    return ok(data);
  }
  if(path[0]==="overview"){
    const [leads,agents,listings,states,merges,bots,threads,notifs]=await Promise.all([
      rows("voxora_leads?select=id,prefix,status,assigned_agent_id&limit=5000"), rows("voxora_sales_agents?select=id,name,status&limit=500"),
      rows("listings?select=id,owner_id,user_id,is_claimed,is_visible&limit=5000"), rows("voxora_listing_state?select=daleely_listing_id,ops_status&limit=5000"),
      rows("voxora_merge_jobs?select=id,status&limit=5000"), rows("voxora_bot_queue?select=id,status&limit=5000"),
      rows("voxora_whatsapp_threads?select=id,unread_count&limit=5000"), rows("voxora_internal_notifications?select=id,read&limit=5000")
    ]);
    const leadsByPrefix:Record<string,number>={}; const callStatusCounts:Record<string,number>={};
    for(const l of leads){ const p=l.prefix||"other"; leadsByPrefix[p]=(leadsByPrefix[p]||0)+1; callStatusCounts[l.status]=(callStatusCounts[l.status]||0)+1; }
    const distribution:DistributionRowDTO[]=agents.map(a=>{ const mine=leads.filter(l=>l.assigned_agent_id===a.id); const counts:Record<string,number>={}; for(const l of mine){const p=l.prefix||"other";counts[p]=(counts[p]||0)+1;} return {agentId:a.id,agentName:a.name,status:a.status,counts,total:mine.length}; });
    const stateMap=new Map(states.map(s=>[s.daleely_listing_id,s.ops_status]));
    const data:OpsOverviewDTO={ totalLeads:leads.length,leadsByPrefix,distribution,
      unclaimedCount:listings.filter(l=>!l.owner_id&&!l.user_id&&!l.is_claimed).length,
      pendingMerges:merges.filter(m=>m.status==="pending_review").length,botQueued:bots.filter(b=>b.status==="queued").length,botRunning:bots.filter(b=>b.status==="running").length,
      whatsappUnread:threads.reduce((s,t)=>s+(t.unread_count||0),0),callStatusCounts,
      invalidCount:[...stateMap.values()].filter(s=>s==="invalid_phone"||s==="wrong_business_phone"||s==="out_of_service").length,
      closedCount:[...stateMap.values()].filter(s=>s==="closed_business").length,hiddenCount:listings.filter(l=>!l.is_visible).length,notificationsUnread:notifs.filter(n=>!n.read).length };
    return ok(data);
  }
  if(path[0]==="agents"){
    const agentPath=actor.type==="sales_agent"
      ? `voxora_sales_agents?select=*&id=eq.${qs(actor.id)}&limit=1`
      : "voxora_sales_agents?select=*&order=created_at.asc&limit=500";
    const leadPath=actor.type==="sales_agent"
      ? `voxora_leads?select=assigned_agent_id&assigned_agent_id=eq.${qs(actor.id)}&limit=5000`
      : "voxora_leads?select=assigned_agent_id&limit=5000";
    const [agents,leads]=await Promise.all([rows(agentPath),rows(leadPath)]);
    return ok(agents.map(a=>({id:a.id,name:a.name,role:a.role,rawPhone:a.raw_phone,status:a.status,canReceiveLeads:a.can_receive_leads,createdAt:a.created_at,activeLeads:leads.filter(l=>l.assigned_agent_id===a.id).length})));
  }
  if(path[0]==="leads"&&!path[1]){
    const ctx=await context(); let ls=await rows("voxora_leads?select=*&order=updated_at.desc&limit=5000");
    const agentId=url.searchParams.get("agentId"),status=url.searchParams.get("status"),prefix=url.searchParams.get("prefix");
    if(actor.type==="sales_agent") ls=ls.filter(l=>l.assigned_agent_id===actor.id);
    else if(agentId) ls=ls.filter(l=>l.assigned_agent_id===agentId);
    if(status&&status!=="all")ls=ls.filter(l=>l.status===status); if(prefix&&prefix!=="all")ls=ls.filter(l=>l.prefix===prefix);
    if(q)ls=ls.filter(l=>String(l.normalized_phone||"").includes(q)||String(l.raw_phone||"").includes(q)||String(l.business_name||"").toLowerCase().includes(q)||String(l.customer_name||"").toLowerCase().includes(q));
    return ok(ls.map(l=>leadDTO(l,ctx.agentNames,ctx.listingNames,ctx.registered)));
  }
  if(path[0]==="leads"&&path[1]&&path[2]==="detail"){
    const l=await getLead(path[1]); if(!l)return err("lead_not_found",404); if(!canAccessLead(actor,l))return err("forbidden",403); const ctx=await context();
    const [timeline,calls,followups,bot,links]=await Promise.all([
      rows(`voxora_timeline_events?select=*&lead_id=eq.${qs(l.id)}&order=created_at.desc&limit=500`),
      rows(`voxora_call_attempts?select=*&lead_id=eq.${qs(l.id)}&order=created_at.desc&limit=500`),
      rows(`voxora_followups?select=*&lead_id=eq.${qs(l.id)}&order=scheduled_at.asc&limit=500`),
      rows(`voxora_bot_queue?select=*&lead_id=eq.${qs(l.id)}&limit=1`),
      rows(`voxora_lead_listings?select=daleely_listing_id&lead_id=eq.${qs(l.id)}&limit=100`)
    ]);
    const listingIds=[...new Set([l.daleely_listing_id,...links.map(x=>x.daleely_listing_id)].filter(Boolean))];
    const linkedListings:ListingDTO[]=[]; for(const id of listingIds){const x=await getListing(id);if(x)linkedListings.push(listingDTO(x));}
    const profiles=l.daleely_user_id?await rows(`user_profiles?select=user_id,full_name,name,phone&user_id=eq.${qs(l.daleely_user_id)}&limit=1`):[];
    return ok({lead:leadDTO(l,ctx.agentNames,ctx.listingNames,ctx.registered),timeline:timeline.map(timelineDTO),
      calls:calls.map(c=>({id:c.id,leadId:c.lead_id,agentType:c.agent_type,agentId:c.agent_id,outcome:c.outcome,reason:c.reason,confidence:c.confidence,notes:c.notes,durationSec:c.duration_sec,createdAt:c.created_at})),
      followups:followups.map(f=>({id:f.id,leadId:f.lead_id,scheduledAt:f.scheduled_at,reason:f.reason,assigneeId:f.assignee_id,priority:f.priority,status:f.status,createdAt:f.created_at,completedAt:f.completed_at})),
      listing:linkedListings[0]||null,listings:linkedListings,user:profiles[0]?{id:profiles[0].user_id,fullName:profiles[0].full_name||profiles[0].name||"",isRegistered:true,normalizedPhone:canonPhone(profiles[0].phone)}:null,
      botItem:bot[0]?{id:bot[0].id,leadId:bot[0].lead_id,status:bot[0].status,priority:bot[0].priority,attempts:bot[0].attempts,scheduledAt:bot[0].scheduled_at,lastResult:bot[0].last_result,addedAt:bot[0].added_at,startedAt:bot[0].started_at,finishedAt:bot[0].finished_at}:null});
  }
  if(path[0]==="leads"&&path[1]&&path[2]==="link-candidates"){
    const lead=await getLead(path[1]); if(!lead)return err("lead_not_found",404); if(!canAccessLead(actor,lead))return err("forbidden",403);
    const list=await rows("listings?select=id,name,phone,main_category,category,owner_id,user_id,is_claimed,is_deleted,deleted_at&owner_id=is.null&user_id=is.null&is_claimed=eq.false&is_deleted=eq.false&deleted_at=is.null&limit=5000");
    const matched=list.filter(l=>canonPhone(l.phone)===lead.normalized_phone).slice(0,30);
    return ok(matched.map(l=>({id:l.id,businessName:l.name||"",normalizedPhone:canonPhone(l.phone),category:l.main_category||l.category||null,leadId:lead.id})));
  }
  if(path[0]==="lookup"){
    const n=normalizePhone(url.searchParams.get("phone")||""); if(!n.ok)return err("invalid_phone");
    const [profiles,listings,leads,calls,threads,links]=await Promise.all([rows("user_profiles?select=user_id,full_name,name,phone&limit=5000"),rows("listings?select=*&limit=5000"),rows("voxora_leads?select=*&limit=5000"),rows("voxora_call_attempts?select=lead_id&limit=10000"),rows("voxora_whatsapp_threads?select=phone_normalized&limit=5000"),rows("voxora_lead_listings?select=*&limit=10000")]);
    const profile=profiles.find(p=>canonPhone(p.phone)===n.canonical); const owned=profile?listings.filter(l=>(l.owner_id||l.user_id)===profile.user_id):[]; const potential=listings.filter(l=>!l.owner_id&&!l.user_id&&!l.is_claimed&&canonPhone(l.phone)===n.canonical);
    const lead=leads.find(l=>l.normalized_phone===n.canonical); const ctx=await context();
    return ok({normalizedPhone:n.canonical,prefix:n.prefix,registered:!!profile,registeredUserName:profile?(profile.full_name||profile.name||null):null,ownedListings:owned.map(x=>listingDTO(x,undefined,profile)),potentialUnclaimed:potential.map(x=>({listing:listingDTO(x),matchScore:95,matchReason:"نفس رقم الهاتف"})),existingLead:lead?leadDTO(lead,ctx.agentNames,ctx.listingNames,ctx.registered):null,recentCalls:lead?calls.filter(c=>c.lead_id===lead.id).length:0,whatsappThreads:threads.filter(t=>t.phone_normalized===n.canonical).length,linkedListingCount:lead?links.filter(x=>x.lead_id===lead.id).length:0});
  }
  if(path[0]==="unclaimed"){
    const [listings,states,leads,agents,profiles]=await Promise.all([rows("listings?select=*&owner_id=is.null&user_id=is.null&is_claimed=eq.false&is_deleted=eq.false&deleted_at=is.null&limit=5000"),rows("voxora_listing_state?select=*&limit=5000"),rows("voxora_leads?select=*&limit=5000"),rows("voxora_sales_agents?select=id,name&limit=500"),rows("user_profiles?select=user_id,full_name,name,phone&limit=5000")]);
    const stateMap=new Map(states.map(s=>[s.daleely_listing_id,s])); const agentMap=new Map(agents.map(a=>[a.id,a.name])); const status=url.searchParams.get("status")||"unclaimed";
    let list=listings; if(status!=="unclaimed") list=listings.filter(l=>{const s=stateMap.get(l.id)?.ops_status||(l.is_visible?"active":"hidden");return status==="hidden"?["hidden","suspended"].includes(s):status==="closed"?s==="closed_business":status==="invalid"?["invalid_phone","out_of_service","wrong_business_phone"].includes(s):status==="merged"?s==="merged":s===status;});
    if(q)list=list.filter(l=>[l.name,l.phone,l.address,l.village,l.center,l.city].some(v=>String(v||"").toLowerCase().includes(q)));
    return ok(list.map(l=>{const phone=canonPhone(l.phone);const lead=leads.find(x=>x.normalized_phone===phone);const candidates=profiles.filter(p=>canonPhone(p.phone)===phone).map(p=>({userId:p.user_id,fullName:p.full_name||p.name||"",normalizedPhone:phone,isRegistered:true,matchScore:95,matchReason:"نفس رقم الهاتف"}));return {...listingDTO(l,stateMap.get(l.id)),ownerCandidates:candidates,leadAgentName:lead?agentMap.get(lead.assigned_agent_id)||null:null,lastContactAt:lead?.updated_at||null,leadId:lead?.id||null};}));
  }
  if(path[0]==="duplicates"){
    const jobs=await rows("voxora_merge_jobs?select=*&order=created_at.desc&limit=2000"); const out:MergeJobDTO[]=[];
    for(const j of jobs){const c=await getListing(j.canonical_listing_id),d=await getListing(j.duplicate_listing_id);out.push({id:j.id,canonicalListingId:j.canonical_listing_id,duplicateListingId:j.duplicate_listing_id,confidence:j.confidence,reasons:arr(j.reasons),status:j.status,fieldChanges:arr(j.field_changes),createdAt:j.created_at,reviewedAt:j.reviewed_at,canonical:c?listingDTO(c):null,duplicate:d?listingDTO(d):null});}
    return ok(out);
  }
  if(path[0]==="bot-queue"){
    const [items,leads]=await Promise.all([rows("voxora_bot_queue?select=*&order=priority.asc,added_at.asc&limit=5000"),rows("voxora_leads?select=*&limit=5000")]); const ctx=await context(); const map=new Map(leads.map(l=>[l.id,l]));
    return ok(items.map(i=>{const lead=map.get(i.lead_id);return ({id:i.id,leadId:i.lead_id,status:i.status,priority:i.priority,attempts:i.attempts,scheduledAt:i.scheduled_at,lastResult:i.last_result,addedAt:i.added_at,startedAt:i.started_at,finishedAt:i.finished_at,lead:lead?leadDTO(lead,ctx.agentNames,ctx.listingNames,ctx.registered):null}) satisfies BotQueueDTO;}));
  }
  if(path[0]==="whatsapp"&&path[1]==="threads"&&!path[2]){
    const [threads,msgs,leads]=await Promise.all([rows("voxora_whatsapp_threads?select=*&order=last_message_at.desc.nullslast&limit=5000"),rows("voxora_whatsapp_messages?select=*&order=created_at.desc&limit=10000"),rows("voxora_leads?select=*&limit=5000")]); const ctx=await context();const lm=new Map(leads.map(l=>[l.id,l]));
    const visible=actor.type==="sales_agent"?threads.filter(t=>t.lead_id&&lm.get(t.lead_id)?.assigned_agent_id===actor.id):threads;
    return ok(visible.map(t=>{const m=msgs.find(x=>x.thread_id===t.id);const lead=t.lead_id?lm.get(t.lead_id):undefined;return {id:t.id,leadId:t.lead_id,phoneNormalized:t.phone_normalized,displayName:t.display_name,listingId:t.daleely_listing_id,lastMessageAt:t.last_message_at,unreadCount:t.unread_count,lastMessagePreview:m?.body||"",lastMessageStatus:m?.status||"",lead:lead?leadDTO(lead,ctx.agentNames,ctx.listingNames,ctx.registered):null} satisfies WhatsAppThreadDTO;}));
  }
  if(path[0]==="whatsapp"&&path[1]==="threads"&&path[2]){
    const t=(await rows(`voxora_whatsapp_threads?select=*&id=eq.${qs(path[2])}&limit=1`))[0]; if(!t)return err("thread_not_found",404);
    if(actor.type==="sales_agent"){ const lead=t.lead_id?await getLead(t.lead_id):null; if(!canAccessLead(actor,lead))return err("forbidden",403); }
    const msgs=await rows(`voxora_whatsapp_messages?select=*&thread_id=eq.${qs(t.id)}&order=created_at.asc&limit=5000`);
    await patch("voxora_whatsapp_threads",`id=eq.${qs(t.id)}`,{unread_count:0});
    return ok({thread:{id:t.id,leadId:t.lead_id,phoneNormalized:t.phone_normalized,displayName:t.display_name,listingId:t.daleely_listing_id,lastMessageAt:t.last_message_at,unreadCount:0},messages:msgs.map(m=>({id:m.id,threadId:m.thread_id,direction:m.direction,body:m.body,template:m.template,status:m.status,actorType:m.actor_type,sentAt:m.sent_at,deliveredAt:m.delivered_at,readAt:m.read_at,createdAt:m.created_at} satisfies WhatsAppMessageDTO))});
  }
  if(path[0]==="audit"){
    let logs=await rows("voxora_audit_logs?select=*&order=created_at.desc&limit=2000"); const actorQ=url.searchParams.get("actor"),entity=url.searchParams.get("entity"),action=url.searchParams.get("action"); if(actorQ)logs=logs.filter(x=>x.actor_type===actorQ);if(entity)logs=logs.filter(x=>x.entity_type===entity);if(action)logs=logs.filter(x=>String(x.action).includes(action));return ok(logs.map(auditDTO));
  }
  if(path[0]==="performance"){
    const [agents,calls,leads,followups]=await Promise.all([rows("voxora_sales_agents?select=id,name,status,role&limit=500"),rows("voxora_call_attempts?select=*&limit=20000"),rows("voxora_leads?select=id,assigned_agent_id,status&limit=5000"),rows("voxora_followups?select=assignee_id,status&limit=5000")]); const data:PerformanceRowDTO[]=agents.filter(a=>a.status!=="removed").map(a=>{const cs=calls.filter(c=>c.agent_id===a.id);const ls=leads.filter(l=>l.assigned_agent_id===a.id);const linked=ls.filter(l=>l.status==="linked").length;return {label:a.name,kind:"sales",calls:cs.length,answered:cs.filter(c=>!["busy","no_answer","switched_off","failed"].includes(c.outcome)).length,interested:cs.filter(c=>c.outcome==="interested").length,followups:followups.filter(f=>f.assignee_id===a.id).length,linked,conversionRate:cs.length?Math.round((linked/cs.length)*100):0};}); const ai=calls.filter(c=>c.agent_type==="ai_agent");data.push({label:"Voxora AI",kind:"ai",calls:ai.length,answered:ai.filter(c=>!["busy","no_answer","switched_off","failed"].includes(c.outcome)).length,interested:ai.filter(c=>c.outcome==="interested").length,followups:0,linked:ai.filter(c=>c.outcome==="linked").length,conversionRate:ai.length?Math.round(ai.filter(c=>c.outcome==="linked").length/ai.length*100):0});return ok(data);
  }
  if(path[0]==="notifications") return ok(await rows(actor.type==="sales_agent"
    ? `voxora_internal_notifications?select=*&target_agent_id=eq.${qs(actor.id)}&order=created_at.desc&limit=500`
    : "voxora_internal_notifications?select=*&order=created_at.desc&limit=500"));
  if(path[0]==="listings") { const ls=await rows("listings?select=*&limit=5000");return ok(ls.filter(l=>!q||[l.name,l.phone,l.address].some(v=>String(v||"").toLowerCase().includes(q))).map(l=>listingDTO(l))); }
  return err("unknown_route:"+path.join("/"),404);
}

export async function handleSupabaseOpsPost(path:string[],req:Request,actor:VoxoraActor):Promise<Response>{
  const body=await req.json().catch(()=>({})) as Json; const str=(k:string)=>typeof body[k]==="string"?String(body[k]).trim():"";
  const adminOnlyPost=new Set(["listings","bot-queue","merge","agents"]);
  if(actor.type==="sales_agent" && adminOnlyPost.has(path[0])) return err("forbidden",403);
  if(path[0]==="leads"&&!path[1]){
    if(actor.type==="sales_agent") return err("forbidden",403);
    const raw=str("phone")||str("rawPhone");const n=normalizePhone(raw);if(!n.ok)return err("invalid_phone");
    const profiles=await rows("user_profiles?select=user_id,full_name,name,phone&limit=5000");const p=profiles.find(x=>canonPhone(x.phone)===n.canonical);
    const result=await daleelyRpc<Row>("voxora_ensure_lead",{p_raw_phone:raw,p_listing_id:body.listingId||null,p_user_id:p?.user_id||body.userId||null,p_business_name:str("businessName"),p_customer_name:str("customerName")||(p?.full_name||p?.name||""),p_source:str("source")||"admin"});
    await addAudit(actor,"lead.created_or_matched","lead",result.id,{newValue:{normalizedPhone:n.canonical},source:"sales_pipeline"});return ok({leadId:result.id,normalizedPhone:result.normalized_phone,assignedAgentId:result.assigned_agent_id});
  }
  if(path[0]==="listings"&&!path[1]){
    const name=str("businessName"),raw=str("phone");const n=normalizePhone(raw);if(!name)return err("missing_business_name");if(!n.ok)return err("invalid_phone");
    const all=await rows("listings?select=*&limit=5000");const normalizeName=(s:string)=>s.toLowerCase().replace(/[\s\-_.,،]+/g,"").replace(/(ال)/g,"");const nn=normalizeName(name);
    const candidate=all.find(l=>canonPhone(l.phone)===n.canonical&&normalizeName(String(l.name||""))===nn)||null;
    const created=await insert<Row>("listings",{name,type:str("type")||"business",phone:raw,whatsapp:str("whatsapp")||raw,category:str("category")||null,main_category:str("category")||"businesses",center:str("city")||null,city:str("city")||null,village:str("village")||null,address:str("address")||null,description:str("description")||null,status:"active",review_status:"approved",is_visible:true,is_claimed:false});
    const lead=await daleelyRpc<Row>("voxora_ensure_lead",{p_raw_phone:raw,p_listing_id:created.id,p_user_id:null,p_business_name:name,p_customer_name:"",p_source:"voxora_admin"});
    if(candidate){const merge=await daleelyRpc<Row>("voxora_merge_listings",{p_canonical_id:candidate.id,p_duplicate_id:created.id,p_confidence:100,p_reasons:[{code:"exact_phone_name",label:"نفس الهاتف والاسم",score:100}],p_actor_id:actor.id});return ok({created:true,merged:true,canonicalListingId:candidate.id,duplicateListingId:created.id,lead,merge});}
    return ok({created:true,merged:false,listingId:created.id,lead});
  }
  if(path[0]==="listings"&&path[2]==="restore") { const data=await daleelyRpc("voxora_restore_listing",{p_listing_id:path[1],p_actor_id:actor.id});return ok(data); }
  if(path[0]==="leads"&&path[1]){
    const lead=await getLead(path[1]);if(!lead)return err("lead_not_found",404);if(!canAccessLead(actor,lead))return err("forbidden",403);const leadId=lead.id;
    if(actor.type==="sales_agent" && ["bot","transfer"].includes(path[2]||"")) return err("forbidden",403);
    if(path[2]==="outcome"){
      const outcome=str("outcome");const valid=["busy","no_answer","switched_off","invalid_number","out_of_service","answered","interested","not_interested","callback","whatsapp_followup","linked","transferred_to_sales","closed_business","completed","failed"];if(!valid.includes(outcome))return err("invalid_outcome");
      await patch("voxora_leads",`id=eq.${qs(leadId)}`,{status:outcome,last_outcome:outcome}); const attempt=await insert<Row>("voxora_call_attempts",{lead_id:leadId,agent_type:actor.type==="sales_agent"?"sales_agent":"sales_agent",agent_id:lead.assigned_agent_id,outcome,reason:str("reason")||null,confidence:typeof body.confidence==="number"?body.confidence:null,notes:str("notes")||null,duration_sec:typeof body.durationSec==="number"?Math.round(body.durationSec as number):0,started_at:now(),ended_at:now()}); await addTimeline(leadId,"call_outcome",`نتيجة اتصال: ${outcome}`,actor,{outcome});await addAudit(actor,"lead.outcome","lead",leadId,{oldValue:{status:lead.status},newValue:{status:outcome},source:"sales_workspace"});return ok({status:outcome,attemptId:attempt.id});
    }
    if(path[2]==="bot"){
      const existing=(await rows(`voxora_bot_queue?select=*&lead_id=eq.${qs(leadId)}&limit=1`))[0];let item=existing;if(existing){await patch("voxora_bot_queue",`id=eq.${qs(existing.id)}`,{status:"queued",added_by_id:actor.id,added_at:now()});}else item=await insert<Row>("voxora_bot_queue",{lead_id:leadId,status:"queued",priority:5,attempts:0,added_by_id:actor.id});await patch("voxora_leads",`id=eq.${qs(leadId)}`,{bot_status:"queued",bot_added_by_id:actor.id,bot_added_at:now(),original_agent_id:lead.original_agent_id||lead.assigned_agent_id,status:"queued"});await addTimeline(leadId,"bot_queued","تمت إضافة العميل إلى AI Agent",actor);return ok({queued:true,queueItemId:item.id});
    }
    if(path[2]==="link-owner"){
      const listingId=str("listingId")||lead.daleely_listing_id;if(!listingId)return err("missing_listing_id");let userId=str("userId")||lead.daleely_user_id||"";if(!userId){const ps=await rows("user_profiles?select=user_id,phone&limit=5000");userId=ps.find(p=>canonPhone(p.phone)===lead.normalized_phone)?.user_id||"";}if(!userId)return err("registered_owner_not_found");const result=await daleelyRpc("voxora_link_listing_owner",{p_listing_id:listingId,p_user_id:userId,p_phone:lead.normalized_phone,p_method:"manual",p_confidence:100,p_reason:str("reason")||"ربط يدوي بواسطة المبيعات",p_actor_type:actor.type,p_actor_id:actor.id});return ok(result);
    }
    if(path[2]==="confirm-business-status"){
      let status=str("status")||str("outcome");if(status==="invalid_number")status="invalid_phone";const result=await daleelyRpc("voxora_confirm_listing_status",{p_listing_id:str("listingId")||lead.daleely_listing_id,p_status:status,p_reason:str("reason")||"تأكيد من المبيعات",p_confidence:typeof body.confidence==="number"?body.confidence:100,p_source:"sales_confirmation",p_actor_type:actor.type,p_actor_id:actor.id});await patch("voxora_leads",`id=eq.${qs(leadId)}`,{status:status==="invalid_phone"?"invalid_number":status,last_outcome:status});return ok(result);
    }
    if(path[2]==="transfer"){
      const to=str("toAgentId");if(!to)return err("missing_agent");await patch("voxora_leads",`id=eq.${qs(leadId)}`,{assigned_agent_id:to,status:"transferred_to_sales",last_outcome:"transferred_to_sales"});await addTimeline(leadId,"lead_transferred","تم تحويل العميل لموظف مبيعات آخر",actor,{toAgentId:to});return ok({transferred:true});
    }
    if(path[2]==="notes") { const text=str("body")||str("notes");if(!text)return err("missing_note");await addTimeline(leadId,"note",text,actor);return ok({saved:true}); }
    if(path[2]==="callback") { const scheduledAt=str("scheduledAt");if(!scheduledAt)return err("missing_scheduled_at");const f=await insert<Row>("voxora_followups",{lead_id:leadId,scheduled_at:scheduledAt,reason:str("reason"),assignee_id:lead.assigned_agent_id,priority:lead.priority,status:"scheduled"});await patch("voxora_leads",`id=eq.${qs(leadId)}`,{status:"callback",last_outcome:"callback"});await addTimeline(leadId,"callback_scheduled","تم تحديد موعد متابعة",actor,{scheduledAt});return ok({followupId:f.id}); }
    if(path[2]==="whatsapp-followup"){
      let thread=(await rows(`voxora_whatsapp_threads?select=*&phone_normalized=eq.${qs(lead.normalized_phone)}&limit=1`))[0];if(!thread)thread=await insert<Row>("voxora_whatsapp_threads",{lead_id:leadId,phone_normalized:lead.normalized_phone,display_name:lead.customer_name||lead.business_name||lead.normalized_phone,daleely_listing_id:lead.daleely_listing_id,unread_count:0});const msg=await insert<Row>("voxora_whatsapp_messages",{thread_id:thread.id,direction:"out",body:str("body")||"متابعة من فريق المبيعات",status:"queued",actor_type:actor.type==="sales_agent"?"sales_agent":"sales_agent",actor_id:actor.id});await patch("voxora_whatsapp_threads",`id=eq.${qs(thread.id)}`,{last_message_at:now()});await patch("voxora_leads",`id=eq.${qs(leadId)}`,{status:"whatsapp_followup",last_outcome:"whatsapp_followup"});await addTimeline(leadId,"whatsapp_sent","متابعة واتساب تمت إضافتها للطابور",actor,{threadId:thread.id,messageId:msg.id});return ok({threadId:thread.id,messageId:msg.id,queued:true});
    }
  }
  if(path[0]==="bot-queue"&&path[1]&&path[2]==="action"){
    const item=(await rows(`voxora_bot_queue?select=*&id=eq.${qs(path[1])}&limit=1`))[0];if(!item)return err("queue_item_not_found",404);const action=str("action");const lead=await getLead(item.lead_id);
    if(action==="start"){await patch("voxora_bot_queue",`id=eq.${qs(item.id)}`,{status:"running",started_at:now()});if(lead)await patch("voxora_leads",`id=eq.${qs(lead.id)}`,{bot_status:"running",status:"calling"});}
    else if(action==="pause"){await patch("voxora_bot_queue",`id=eq.${qs(item.id)}`,{status:"paused"});if(lead)await patch("voxora_leads",`id=eq.${qs(lead.id)}`,{bot_status:"queued",status:"queued"});}
    else if(action==="resume"){await patch("voxora_bot_queue",`id=eq.${qs(item.id)}`,{status:"queued"});}
    else if(action==="prioritize"){await patch("voxora_bot_queue",`id=eq.${qs(item.id)}`,{priority:Math.max(1,(item.priority||5)-2)});}
    else if(action==="return_to_sales"){await patch("voxora_bot_queue",`id=eq.${qs(item.id)}`,{status:"returned",finished_at:now()});if(lead)await patch("voxora_leads",`id=eq.${qs(lead.id)}`,{bot_status:"returned",assigned_agent_id:lead.original_agent_id||lead.assigned_agent_id,status:(lead.original_agent_id||lead.assigned_agent_id)?"assigned":"new"});}
    else if(action==="remove"){await removeRows("voxora_bot_queue",`id=eq.${qs(item.id)}`);if(lead)await patch("voxora_leads",`id=eq.${qs(lead.id)}`,{bot_status:"none",status:lead.assigned_agent_id?"assigned":"new"});}
    else return err("invalid_action");await addAudit(actor,`bot.${action}`,"bot_queue_item",item.id,{source:"bot_queue"});return ok({action});
  }
  if(path[0]==="merge"&&path[1]&&path[2]==="action"){
    const job=(await rows(`voxora_merge_jobs?select=*&id=eq.${qs(path[1])}&limit=1`))[0];if(!job)return err("merge_job_not_found",404);const action=str("action");
    if(action==="merge"){const result=await daleelyRpc("voxora_merge_listings",{p_canonical_id:job.canonical_listing_id,p_duplicate_id:job.duplicate_listing_id,p_confidence:job.confidence,p_reasons:job.reasons,p_actor_id:actor.id});return ok(result);}
    if(action==="reject"){await patch("voxora_merge_jobs",`id=eq.${qs(job.id)}`,{status:"rejected",reviewed_by_id:actor.id,reviewed_at:now()});return ok({rejected:true});}
    if(action==="manual_review"){await patch("voxora_merge_jobs",`id=eq.${qs(job.id)}`,{status:"manual_review",reviewed_by_id:actor.id,reviewed_at:now()});return ok({manualReview:true});}return err("invalid_action");
  }
  if(path[0]==="agents"&&!path[1]){const name=str("name"),role=str("role")||"sales";if(!name)return err("missing_name");const a=await insert<Row>("voxora_sales_agents",{name,role,raw_phone:str("phone")||null,status:"active",can_receive_leads:role==="sales"||role==="manager"});await addAudit(actor,"agent.added","sales_agent",a.id,{newValue:{name,role},source:"team_management"});return ok({agentId:a.id});}
  if(path[0]==="agents"&&path[1]&&path[2]==="action"){
    const a=(await rows(`voxora_sales_agents?select=*&id=eq.${qs(path[1])}&limit=1`))[0];if(!a)return err("agent_not_found",404);const action=str("action");
    if(action==="disable"||action==="activate"){const active=action==="activate";await patch("voxora_sales_agents",`id=eq.${qs(a.id)}`,{status:active?"active":"disabled",can_receive_leads:active&&(a.role==="sales"||a.role==="manager")});if(!active){const open=["new","assigned","queued","calling","ringing","answered","callback","whatsapp_followup","interested","transferred_to_sales"];const ls=await rows(`voxora_leads?select=*&assigned_agent_id=eq.${qs(a.id)}&limit=5000`);for(const l of ls.filter(x=>open.includes(x.status))){const picked=await daleelyRpc<string|null>("voxora_pick_sales_agent",{p_prefix:l.prefix});if(picked)await patch("voxora_leads",`id=eq.${qs(l.id)}`,{assigned_agent_id:picked});}}return ok({ok:true});}
    if(action==="set-role"){const role=str("role");await patch("voxora_sales_agents",`id=eq.${qs(a.id)}`,{role,can_receive_leads:role==="sales"||role==="manager"});return ok({ok:true});}return err("invalid_action");
  }
  if(path[0]==="whatsapp"&&path[1]==="threads"&&path[2]&&path[3]==="send"){
    const t=(await rows(`voxora_whatsapp_threads?select=*&id=eq.${qs(path[2])}&limit=1`))[0];if(!t)return err("thread_not_found",404);
    if(actor.type==="sales_agent"){const lead=t.lead_id?await getLead(t.lead_id):null;if(!canAccessLead(actor,lead))return err("forbidden",403);}
    const m=await insert<Row>("voxora_whatsapp_messages",{thread_id:t.id,direction:"out",body:str("body"),template:str("template")||null,status:"queued",actor_type:"sales_agent",actor_id:actor.id});await patch("voxora_whatsapp_threads",`id=eq.${qs(t.id)}`,{last_message_at:now()});return ok({messageId:m.id,queued:true});
  }
  if(path[0]==="whatsapp"&&path[1]==="threads"&&path[2]&&path[3]==="simulate-reply") return err("simulation_disabled_in_production",409);
  if(path[0]==="notifications"&&path[1]==="read") {
    if(str("scope")==="all"){
      const filter=actor.type==="sales_agent"?`read=eq.false&target_agent_id=eq.${qs(actor.id)}`:"read=eq.false";
      await patch("voxora_internal_notifications",filter,{read:true});
    } else if(Array.isArray(body.ids)){
      for(const id of body.ids as string[]){
        if(actor.type==="sales_agent"){
          const owned=(await rows(`voxora_internal_notifications?select=id&target_agent_id=eq.${qs(actor.id)}&id=eq.${qs(id)}&limit=1`))[0];
          if(!owned)continue;
        }
        await patch("voxora_internal_notifications",`id=eq.${qs(id)}`,{read:true});
      }
    }
    return ok({ok:true});
  }
  return err("unknown_route:"+path.join("/"),404);
}
