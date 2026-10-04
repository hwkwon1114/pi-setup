import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import usageLimits from './usage-limits.ts';

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
const agentDir = mkdtempSync(join(tmpdir(), 'pi-usage-test-'));
process.env.PI_CODING_AGENT_DIR = agentDir;
test.after(() => {
  if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  rmSync(agentDir, {recursive:true, force:true});
});
test.beforeEach(() => writeFileSync(join(agentDir,'auth.json'), JSON.stringify({
  'openai-codex':{type:'oauth',access:'fixture-primary'},
  'openai-codex-2':{type:'oauth',access:'fixture-secondary'},
  'openai':{type:'oauth',access:'fixture-direct',scopes:['chatgpt.tokens.use.direct']},
})));
function harness(provider='openai-codex', hasUI=true) {
  const handlers=new Map(), commands={}, statuses=new Map(), notices=[];
  usageLimits({on:(event,fn)=>handlers.set(event,fn),registerCommand:(name,command)=>commands[name]=command});
  const ctx={model:{provider,id:'test'},hasUI,mode:hasUI?'tui':'print',
    getContextUsage:()=>({tokens:120000,contextWindow:200000}),
    sessionManager:{getSessionId:()=> 'fixture-session'},
    compact:()=>assert.fail('usage display must never request manual compaction'),
    ui:{setStatus:(key,value)=>{assert.ok(hasUI);statuses.set(key,value);},
      notify:message=>{assert.ok(hasUI);notices.push(message);},
      theme:{fg:(_style,text)=>text}}};
  return {ctx,statuses,notices,emit:(event,data={})=>handlers.get(event)?.(
      event === 'turn_end' ? {outcome:'completed',context:{canContinue:false},...data} : data,ctx),
    command:args=>commands.usage.handler(args,ctx)};
}
function mockFetch(t, response={rate_limit:{primary_window:{used_percent:25,limit_window_seconds:18000}}}) {
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls.push({url,options});
    return {ok:true,json:async()=>response};
  });
  return calls;
}
test('usage display leaves compaction to Pi for all providers, windows and UI modes',async()=>{
  for (const provider of ['openai','openai-codex','antigravity']) {
    for (const hasUI of [true,false]) {
      const h=harness(provider,hasUI);
      for (const contextWindow of [100000,272000,1000000]) {
        for (const tokens of [149999,150000,150001,contextWindow-1,contextWindow+1,null]) {
          h.ctx.getContextUsage=()=>({tokens,contextWindow});
          await h.emit('turn_end');
          await h.emit('turn_end',{outcome:'aborted'});
          await h.emit('turn_end',{outcome:'error'});
        }
      }
      assert(h.notices.every(message=>!message.includes('compacting')));
    }
  }
});
test('no idle timer, non-Codex polling, or manual compaction',async t=>{
  const calls=mockFetch(t);
  t.mock.method(globalThis,'setInterval',()=>assert.fail('no idle polling'));
  const h=harness('openai');
  await h.emit('session_start');await h.emit('turn_end');await h.command('refresh');
  assert.equal(calls.length,0);
  assert.match(h.statuses.get('usage-limits'),/120\.0k\/200\.0k/);
  assert.match(h.statuses.get('usage-limits'),/remaining quota unknown/);
});
test('only active account is fetched; cache and forced refresh',async t=>{
  const calls=mockFetch(t);const h=harness();
  await h.emit('session_start');await h.emit('model_select');
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.headers.Authorization,'Bearer fixture-primary');
  assert.match(h.statuses.get('usage-limits'),/75% left/);
  await h.command('refresh');assert.equal(calls.length,2);
  h.ctx.model.provider='openai-codex-2';await h.emit('model_select');
  assert.equal(calls.length,3);
  assert.equal(calls[2].options.headers.Authorization,'Bearer fixture-secondary');
  await h.command('raw');assert.match(h.notices.at(-1),/used_percent/);
});
test('expired cache is refreshed on model selection',async t=>{
  const calls=mockFetch(t);let now=1000000;
  t.mock.method(Date,'now',()=>now);
  const h=harness();await h.emit('session_start');
  now+=180001;await h.emit('model_select');
  assert.equal(calls.length,2);
});
test('headless events do not poll or render',async t=>{
  const calls=mockFetch(t);const h=harness('openai-codex',false);
  await h.emit('session_start');await h.emit('model_select');await h.emit('turn_end');
  await h.command('refresh');await h.emit('session_shutdown');
  assert.equal(calls.length,0);assert.equal(h.statuses.size,0);
});
test('missing credentials and HTTP failures are bounded display failures',async t=>{
  const calls=mockFetch(t);const h=harness('openai-codex-3');
  await h.emit('session_start');assert.equal(calls.length,0);
  h.ctx.model.provider='openai-codex';
  t.mock.method(globalThis,'fetch',async()=>({ok:false,status:429}));
  await h.emit('model_select');assert.match(h.statuses.get('usage-limits'),/HTTP 429/);
});
test('overlapping refreshes share a request and shutdown suppresses late rendering',async t=>{
  let resolve;let calls=0;
  t.mock.method(globalThis,'fetch',()=>{calls++;return new Promise(r=>resolve=r);});
  const h=harness();const start=h.emit('session_start');
  const select=h.emit('model_select');
  assert.equal(calls,1);
  await h.emit('session_shutdown');
  const before=h.statuses.get('usage-limits');
  resolve({ok:true,json:async()=>({remaining:99})});
  await Promise.all([start,select]);
  assert.equal(h.statuses.get('usage-limits'),before);
});
