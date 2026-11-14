#!/usr/bin/env node
/**
 * Voxora minimal Asterisk ARI bridge.
 * Zero npm dependencies; Node 22+ only.
 *
 * This bridge provides call control (originate / hangup / redirect) and the
 * exact HTTP contract expected by /api/telephony/bridge in the web app.
 * Real-time STT/TTS media processing is intentionally a separate worker; this
 * file never pretends that voice AI is active when it is not.
 */
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || process.env.TELEPHONY_BRIDGE_PORT || 8099);
const SHARED_SECRET = process.env.TELEPHONY_API_SECRET || '';
const ARI_URL = (process.env.ASTERISK_ARI_URL || 'http://127.0.0.1:8088/ari').replace(/\/$/, '');
const ARI_USER = process.env.ASTERISK_ARI_USER || 'voxora';
const ARI_PASSWORD = process.env.ASTERISK_ARI_PASSWORD || '';
const ARI_APP = process.env.ASTERISK_ARI_APP || 'voxora';
const MOBILE_DEVICE = process.env.ASTERISK_MOBILE_DEVICE || 'mobile0';
const ENDPOINT_TEMPLATE = process.env.ASTERISK_ENDPOINT_TEMPLATE || 'Mobile/{device}/{phone}';
const HUMAN_ENDPOINT_TEMPLATE = process.env.ASTERISK_HUMAN_ENDPOINT_TEMPLATE || ENDPOINT_TEMPLATE;

let agentStatus = 'offline';
const calls = new Map();

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function authorised(req) {
  if (!SHARED_SECRET) return false;
  const got = req.headers.authorization || '';
  const expected = `Bearer ${SHARED_SECRET}`;
  if (got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

function endpointFromPhone(phone, template = ENDPOINT_TEMPLATE) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!/^01[0125]\d{8}$/.test(digits) && !/^201[0125]\d{8}$/.test(digits)) throw new Error('invalid_phone');
  const local = digits.startsWith('20') ? `0${digits.slice(2)}` : digits;
  return template.replace('{device}', MOBILE_DEVICE).replace('{phone}', local);
}

async function ari(path, { method = 'GET', query, body } = {}) {
  const u = new URL(`${ARI_URL}${path}`);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  const basic = Buffer.from(`${ARI_USER}:${ARI_PASSWORD}`).toString('base64');
  const r = await fetch(u, {
    method,
    headers: { authorization: `Basic ${basic}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!r.ok) throw new Error(`asterisk_${r.status}:${data?.message || text || 'request_failed'}`);
  return data;
}

async function originate(target) {
  const phone = target?.phone;
  const endpoint = endpointFromPhone(phone);
  const callId = crypto.randomUUID();
  const data = await ari('/channels', {
    method: 'POST',
    query: {
      endpoint,
      app: ARI_APP,
      appArgs: callId,
      channelId: callId,
      callerId: process.env.ASTERISK_CALLER_ID || undefined,
      timeout: Number(process.env.ASTERISK_ORIGINATE_TIMEOUT_SECONDS || 45),
    },
  });
  calls.set(callId, {
    id: callId,
    channelId: data?.id || callId,
    phone,
    name: target?.name || '',
    status: 'calling',
    startedAt: new Date().toISOString(),
    transcript: [],
    recordingUrl: null,
  });
  return { callId, channelId: data?.id || callId, status: 'calling' };
}

async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/health' && req.method === 'GET') {
    try {
      await ari('/asterisk/info');
      return json(res, 200, { ok: true, asterisk: true, agentStatus, voiceAi: false });
    } catch (e) {
      return json(res, 503, { ok: false, asterisk: false, error: e instanceof Error ? e.message : 'asterisk_unreachable' });
    }
  }

  if (!authorised(req)) return json(res, 401, { ok: false, error: 'unauthorized' });

  if (url.pathname === '/agent/start' && req.method === 'POST') { agentStatus = 'ready'; return json(res, 200, { status: agentStatus }); }
  if (url.pathname === '/agent/pause' && req.method === 'POST') { agentStatus = 'paused'; return json(res, 200, { status: agentStatus }); }
  if (url.pathname === '/agent/stop' && req.method === 'POST') { agentStatus = 'offline'; return json(res, 200, { status: agentStatus }); }
  if (url.pathname === '/agent/status' && req.method === 'GET') return json(res, 200, { status: agentStatus, activeCalls: [...calls.values()].filter(c => !['completed','failed'].includes(c.status)).length });

  if (url.pathname === '/calls' && req.method === 'POST') {
    if (agentStatus === 'offline') return json(res, 409, { ok: false, error: 'agent_offline' });
    try { return json(res, 200, await originate(await readBody(req))); }
    catch (e) { return json(res, 502, { ok: false, error: e instanceof Error ? e.message : 'originate_failed' }); }
  }

  const match = url.pathname.match(/^\/calls\/([^/]+)\/(hangup|transfer|transcript|recording)$/);
  if (!match) return json(res, 404, { ok: false, error: 'not_found' });
  const callId = decodeURIComponent(match[1]);
  const action = match[2];
  const call = calls.get(callId);
  if (!call) return json(res, 404, { ok: false, error: 'call_not_found' });

  try {
    if (action === 'hangup' && req.method === 'POST') {
      await ari(`/channels/${encodeURIComponent(call.channelId)}`, { method: 'DELETE' });
      call.status = 'completed'; call.endedAt = new Date().toISOString();
      return json(res, 200, { callId, status: call.status });
    }
    if (action === 'transfer' && req.method === 'POST') {
      const body = await readBody(req);
      const endpoint = endpointFromPhone(body.destination, HUMAN_ENDPOINT_TEMPLATE);
      await ari(`/channels/${encodeURIComponent(call.channelId)}/redirect`, { method: 'POST', query: { endpoint } });
      call.status = 'transferred';
      return json(res, 200, { callId, status: call.status, destination: body.destination });
    }
    if (action === 'transcript' && req.method === 'GET') return json(res, 200, { transcript: call.transcript });
    if (action === 'recording' && req.method === 'GET') return json(res, 200, { url: call.recordingUrl });
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  } catch (e) {
    return json(res, 502, { ok: false, error: e instanceof Error ? e.message : 'asterisk_action_failed' });
  }
}

http.createServer((req, res) => handler(req, res).catch((e) => json(res, 500, { ok: false, error: e instanceof Error ? e.message : 'internal_error' })))
  .listen(PORT, '0.0.0.0', () => {
    console.log(`Voxora telephony bridge listening on :${PORT}`);
    console.log(`ARI: ${ARI_URL} · app=${ARI_APP} · device=${MOBILE_DEVICE} · voice-ai=false`);
  });
