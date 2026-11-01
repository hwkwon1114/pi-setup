import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir, homedir} from 'node:os';
import {join} from 'node:path';
import usageLimits, {
  parseAnthropicUsage,
  parseCodexUsage,
  parseAntigravityUsage,
  discoverAccounts,
  windowsForModel,
  fmtResetShort,
  fmtResetDate,
  getAgentDir,
  isCacheStale,
  CACHE_MS,
  ERROR_CACHE_MS,
} from '../usage-limits.ts';

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
const agentDir = mkdtempSync(join(tmpdir(), 'pi-usage-test-'));
process.env.PI_CODING_AGENT_DIR = agentDir;
test.after(() => {
  if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  rmSync(agentDir, {recursive:true, force:true});
});
const FUTURE = Date.now() + 3600_000;
function writeAuth(auth, ag) {
  writeFileSync(join(agentDir,'auth.json'), JSON.stringify(auth));
  writeFileSync(join(agentDir,'antigravity-accounts.json'), JSON.stringify(ag ?? {version:1,accounts:{}}));
}
test.beforeEach(() => writeAuth({
  'anthropic':{type:'oauth',access:'fixture-claude',expires:FUTURE},
  'openai-codex':{type:'oauth',access:'fixture-primary',accountId:'acct-1',expires:FUTURE},
  'openai-codex-2':{type:'oauth',access:'fixture-secondary',expires:FUTURE},
  'openai':{type:'oauth',access:'fixture-direct',scopes:['chatgpt.tokens.use.direct']},
  'antigravity':{type:'oauth',access:'fixture-ag-fresh',email:'a@x.io',expires:FUTURE+10},
  'github-copilot':{type:'oauth',access:'never-sent'},
}, {version:1,activeAccountId:'g1',accounts:{
  g1:{access:'fixture-ag-stale',email:'a@x.io',expires:FUTURE},
  g2:{access:'fixture-ag-expired',email:'b@x.io',expires:Date.now()-1000},
}}));

const RESPONSES = {
  'api.anthropic.com': {five_hour:{utilization:38,resets_at:'2030-01-01T00:00:00Z'},seven_day:{utilization:57},seven_day_opus:null},
  'chatgpt.com': {rate_limit:{allowed:true,primary_window:{used_percent:25,limit_window_seconds:18000},
    secondary_window:{used_percent:96,limit_window_seconds:604800}}},
  'googleapis.com': {groups:[{displayName:'Gemini Models',buckets:[
    {window:'weekly',remainingFraction:0.75},{window:'5h',remainingFraction:0.57}]},
    {displayName:'Claude and GPT models',buckets:[{window:'5h',remainingFraction:1}]}]},
};
function mockFetch(t, respond=url=>RESPONSES[Object.keys(RESPONSES).find(k=>url.includes(k))]) {
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls.push({url,options});
    return {ok:true,json:async()=>respond(url)};
  });
  return calls;
}
function harness(provider='openai-codex', hasUI=true) {
  const handlers=new Map(), commands={}, statuses=new Map(), notices=[];
  usageLimits({on:(event,fn)=>handlers.set(event,fn),registerCommand:(name,command)=>commands[name]=command});
  const ctx={model:{provider,id:'test'},hasUI,mode:hasUI?'tui':'print',
    getContextUsage:()=>({tokens:120000,contextWindow:200000}),
    compact:()=>assert.fail('usage display must never request manual compaction'),
    ui:{setStatus:(key,value)=>{assert.ok(hasUI);statuses.set(key,value);},
      notify:message=>{assert.ok(hasUI);notices.push(message);},
      theme:{fg:(_style,text)=>text}}};
  return {ctx,statuses,notices,emit:(event,data={})=>handlers.get(event)?.(data,ctx),
    command:args=>commands.usage.handler(args,ctx)};
}
const tokens = calls => calls.map(c=>c.options.headers.Authorization).sort();

test('parsers normalise remaining percent per vendor', () => {
  assert.deepEqual(parseAnthropicUsage(RESPONSES['api.anthropic.com']).map(w=>[w.window,w.remaining]), [['5h',62],['7d',43]]);
  const cx = parseCodexUsage(RESPONSES['chatgpt.com']);
  assert.deepEqual(cx.windows.map(w=>[w.window,w.remaining]), [['5h',75],['7d',4]]);
  assert.equal(parseCodexUsage({rate_limit:{limit_reached:true}}).note,'limit reached');
  assert.deepEqual(parseAntigravityUsage(RESPONSES['googleapis.com']).map(w=>[w.group,w.window,w.remaining]),
    [['Gemini Models','5h',57],['Gemini Models','wk',75],['Claude and GPT models','5h',100]]);
  for (const bad of [null,'x',{},{groups:'no'},{rate_limit:5}]) {
    assert.deepEqual(parseAnthropicUsage(bad),[]);assert.deepEqual(parseAntigravityUsage(bad),[]);
    assert.deepEqual(parseCodexUsage(bad).windows,[]);
  }
});

test('discovers every Anthropic, Codex and Antigravity account; prefers fresher active AG token', () => {
  const refs = discoverAccounts();
  assert.deepEqual(refs.map(r=>r.key), ['anthropic','openai-codex','openai-codex-2','antigravity:g1','antigravity:g2']);
  assert.equal(refs[3].token,'fixture-ag-fresh');
  assert.equal(refs[4].token,'fixture-ag-expired');
});

test('footer shows only the selected model account and pool', async t => {
  const calls=mockFetch(t);const h=harness('anthropic');
  h.ctx.model.id='claude-opus-5-5';
  await h.emit('session_start');
  assert.deepEqual(tokens(calls), ['Bearer fixture-claude']);
  let s=h.statuses.get('usage-limits');
  assert.match(s,/120\.0k\/200\.0k │ Claude 5h 62% ↻(Dec 31|Jan 1) \d\d:00 7d 43%$/);
  h.ctx.model={provider:'openai-codex-2',id:'gpt-6'};await h.emit('model_select');
  assert.equal(calls.at(-1).options.headers.Authorization,'Bearer fixture-secondary');
  s=h.statuses.get('usage-limits');assert.match(s,/│ Codex2 5h 75% 7d 4%$/);assert.doesNotMatch(s,/Claude/);
  h.ctx.model={provider:'antigravity',id:'gemini-3.8-flash'};await h.emit('model_select');
  assert.equal(calls.at(-1).options.headers.Authorization,'Bearer fixture-ag-fresh');
  assert.match(h.statuses.get('usage-limits'),/│ AG1 Gem 5h 57% wk 75%$/);
  h.ctx.model.id='claude-sonnet-5-5';await h.emit('model_select');
  assert.match(h.statuses.get('usage-limits'),/│ AG1 Cl\/GPT 5h 100%$/);
  assert.equal(calls.length,3); // cached: same account, no refetch
  h.ctx.model={provider:'github-copilot',id:'x'};await h.emit('model_select');
  assert.equal(h.statuses.get('usage-limits'),'⚡ ctx 120.0k/200.0k');
  assert.equal(calls.length,3);
});

test('codex-auto shows all Codex accounts until routed, then the routed one', async t => {
  const calls=mockFetch(t);const h=harness('codex-auto');
  await h.emit('session_start');
  assert.deepEqual(tokens(calls), ['Bearer fixture-primary','Bearer fixture-secondary']);
  assert.match(h.statuses.get('usage-limits'),/Codex 5h 75% 7d 4% │ Codex2/);
  h.emit('message_end',{message:{role:'assistant',provider:'openai-codex-2',model:'gpt'}});
  const s=h.statuses.get('usage-limits');
  assert.match(s,/Codex2/);assert.doesNotMatch(s,/│ Codex 5h/);
});

test('reset times: relative under a day, weekday within the week, date beyond', () => {
  const now=Date.UTC(2026,10,1,12,0);
  assert.equal(fmtResetShort(now+(2*60+35)*60000,now),'2h35m');
  assert.equal(fmtResetShort(now-1,now),'now');
  assert.match(fmtResetShort(now+2*86400000,now),/^(Mon|Tue|Wed) \d\d:\d\d$/);
  assert.match(fmtResetShort(now+6.5*86400000,now),/^Nov [78] \d\d:\d\d$/);
  assert.match(fmtResetDate(now),/^(Sat|Sun) Nov 1 \d\d:\d\d$/);
});

test('windowsForModel selects Anthropic family windows', () => {
  const u={ref:{vendor:'anthropic'},windows:[{window:'5h'},{window:'7d'},{window:'7d Opus'},{window:'7d Sonnet'}]};
  assert.deepEqual(windowsForModel(u,'claude-opus-5-5').map(w=>w.window),['5h','7d','7d Opus']);
  assert.deepEqual(windowsForModel(u,'claude-sonnet-5-5').map(w=>w.window),['5h','7d','7d Sonnet']);
  const ag={ref:{vendor:'antigravity'},windows:[{group:'Gemini Models',window:'5h'},{group:'Gemini 4 Argon',window:'wk'}]};
  assert.deepEqual(windowsForModel(ag,'gemini-4-argon').map(w=>w.group),['Gemini 4 Argon']);
  assert.deepEqual(windowsForModel(ag,'unknown').length,2);
});

test('/usage fetches every account with its own token; expired tokens are not sent', async t => {
  const calls=mockFetch(t);const h=harness('openai-codex');
  await h.emit('session_start');assert.equal(calls.length,1);
  await h.command('');
  assert.deepEqual(tokens(calls), ['Bearer fixture-ag-fresh','Bearer fixture-claude','Bearer fixture-primary','Bearer fixture-secondary']);
  for (const c of calls) {
    const t = c.options.headers.Authorization;
    if (c.url.includes('anthropic.com')) assert.equal(t,'Bearer fixture-claude');
    if (c.url.includes('chatgpt.com')) assert.match(t,/fixture-(primary|secondary)/);
    if (c.url.includes('googleapis.com')) assert.equal(t,'Bearer fixture-ag-fresh');
  }
  assert.equal(calls.find(c=>c.options.headers.Authorization==='Bearer fixture-primary').options.headers['ChatGPT-Account-Id'],'acct-1');
  const n=h.notices.at(-1);
  assert.match(n,/▸ openai-codex/);assert.match(n,/Gemini Models/);assert.match(n,/AG2 <b@x.io>.*\n\s+token expired — switch to this account/);
  assert.doesNotMatch(h.statuses.get('usage-limits'),/Claude|AG/);
});

test('cache, forced refresh and raw view', async t => {
  const calls=mockFetch(t);let now=Date.now();
  t.mock.method(Date,'now',()=>now);
  const h=harness();
  await h.emit('session_start');assert.equal(calls.length,1);
  await h.emit('model_select');await h.emit('turn_end');assert.equal(calls.length,1);
  await h.command('refresh');assert.equal(calls.length,5);
  now+=180001;await h.emit('model_select');assert.equal(calls.length,6);
  await h.command('raw');assert.match(h.notices.at(-1),/used_percent/);
});

test('headless events do not poll or render', async t => {
  const calls=mockFetch(t);const h=harness('openai-codex',false);
  await h.emit('session_start');await h.emit('model_select');await h.emit('turn_end');
  await h.command('refresh');await h.emit('session_shutdown');
  assert.equal(calls.length,0);assert.equal(h.statuses.size,0);
});

test('no idle timer; turn_end never blocks or compacts', async t => {
  t.mock.method(globalThis,'setInterval',()=>assert.fail('no idle polling'));
  t.mock.method(globalThis,'fetch',()=>new Promise(()=>{}));
  const h=harness();
  assert.equal(h.emit('turn_end'), undefined);
});

test('HTTP failures and missing credentials are bounded display failures', async t => {
  writeAuth({'openai-codex':{type:'oauth',access:'fixture-primary',expires:FUTURE}});
  t.mock.method(globalThis,'fetch',async()=>({ok:false,status:429}));
  const h=harness('openai-codex');await h.emit('session_start');
  assert.match(h.statuses.get('usage-limits'),/Codex HTTP 429$/);
  writeAuth({});
  const calls=mockFetch(t);const h2=harness('openai-codex-3');await h2.emit('session_start');
  assert.equal(calls.length,0);
  await h2.command('');assert.match(h2.notices.at(-1),/No linked subscription accounts/);
});

test('shutdown suppresses late rendering', async t => {
  let resolve=[];
  t.mock.method(globalThis,'fetch',()=>new Promise(r=>resolve.push(r)));
  const h=harness();const start=h.emit('session_start');
  await h.emit('session_shutdown');
  const before=h.statuses.get('usage-limits');
  for (const r of resolve) r({ok:true,json:async()=>({remaining:99})});
  await start;
  assert.equal(h.statuses.get('usage-limits'),before);
});

test('getAgentDir is self-contained and independent of multi-codex', () => {
  const source = readFileSync(new URL('../usage-limits.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from\s+["'].*multi-codex.*["']/);
  assert.equal(getAgentDir(), agentDir);
  const saved = process.env.PI_CODING_AGENT_DIR;
  try {
    delete process.env.PI_CODING_AGENT_DIR;
    assert.equal(getAgentDir(), join(process.env.HOME || homedir(), '.pi', 'agent'));
  } finally {
    process.env.PI_CODING_AGENT_DIR = saved;
  }
});

test('isCacheStale invalidates on changed credentials, cleared expiry, or error TTL', () => {
  const ref = { key: 'openai-codex', vendor: 'codex', label: 'Codex', providers: ['openai-codex'],
    token: 'tok1', expires: FUTURE, accountId: 'a1' };
  const cached = { ref: { ...ref }, windows: [], raw: null, timestamp: 1000 };

  // Fresh cache
  assert.equal(isCacheStale(cached, ref, 1000 + 1000), false);
  // Normal cache expiration
  assert.equal(isCacheStale(cached, ref, 1000 + CACHE_MS), true);

  // Credential changes invalidate immediately
  assert.equal(isCacheStale(cached, { ...ref, token: 'tok2' }, 1000 + 10), true);
  assert.equal(isCacheStale(cached, { ...ref, expires: FUTURE + 500 }, 1000 + 10), true);
  assert.equal(isCacheStale(cached, { ...ref, accountId: 'a2' }, 1000 + 10), true);

  // Token expired error invalidates immediately once expiry becomes future
  const expiredCached = { ref: { ...ref, expires: 500 }, windows: [], error: 'token expired', raw: null, timestamp: 1000 };
  assert.equal(isCacheStale(expiredCached, { ...ref, expires: 2000 }, 1500), true);

  // Transient errors retry after ERROR_CACHE_MS rather than full CACHE_MS
  const errorCached = { ref: { ...ref }, windows: [], error: 'HTTP 500', raw: null, timestamp: 1000 };
  assert.equal(isCacheStale(errorCached, ref, 1000 + ERROR_CACHE_MS - 1), false);
  assert.equal(isCacheStale(errorCached, ref, 1000 + ERROR_CACHE_MS), true);
});

test('refreshes immediately when Pi updates an expired token without waiting 3 minutes', async t => {
  // Start with expired token
  writeAuth({
    'openai-codex': { type: 'oauth', access: 'fixture-expired', expires: Date.now() - 5000 },
  });
  const calls = mockFetch(t);
  const h = harness('openai-codex');
  await h.emit('session_start');
  assert.equal(calls.length, 0, 'expired token makes no network fetch');
  assert.match(h.statuses.get('usage-limits'), /Codex token expired$/);

  // Pi refreshes token and updates auth.json (now + 1 hour)
  writeAuth({
    'openai-codex': { type: 'oauth', access: 'fixture-refreshed', expires: Date.now() + 3600_000 },
  });

  // Next event (e.g. turn_end background refresh after Pi generated with the new token)
  h.emit('turn_end');
  await new Promise(r => setTimeout(r, 10));
  assert.equal(calls.length, 1, 'immediately fetches with refreshed credentials');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer fixture-refreshed');
  assert.match(h.statuses.get('usage-limits'), /Codex 5h 75% 7d 4%$/);
});

test('credential changes on disk invalidate cache immediately without waiting CACHE_MS', async t => {
  const calls = mockFetch(t);
  const h = harness('openai-codex');
  await h.emit('session_start');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer fixture-primary');

  // Same account, but auth.json updated with a new token
  writeAuth({
    'openai-codex': { type: 'oauth', access: 'fixture-primary-v2', accountId: 'acct-1', expires: FUTURE },
  });

  // Background refresh on turn_end immediately detects the new token
  h.emit('turn_end');
  await new Promise(r => setTimeout(r, 10));
  assert.equal(calls.length, 2, 'second fetch triggered immediately');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer fixture-primary-v2');
});
