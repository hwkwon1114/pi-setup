import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRemaining, chooseAccount, createQuotaService, routeCodex, registerCodexRouter, AUTO_MODELS, CODEX_SLOTS, CACHE_MS } from './router.mjs';

const now = 1_700_000_000_000;
const limit = (primary = 20, secondary = 40) => ({ allowed: true, limit_reached: false,
  primary_window: { used_percent: primary, reset_at: now / 1000 + 3600 },
  secondary_window: secondary === null ? null : { used_percent: secondary, reset_at: now / 1000 + 86400 } });
const usage = (primary = 20, secondary = 40) => ({ rate_limit: limit(primary, secondary) });
const jwt = id => `fixture.${Buffer.from(JSON.stringify({'https://api.openai.com/auth': { chatgpt_account_id: id }})).toString('base64url')}.fixture`;
const credentials = Object.fromEntries(CODEX_SLOTS.map((provider, i) => [provider, { type: 'oauth', accountId: `fixture-${i}`, access: jwt(`fixture-${i}`) }]));
const model = (provider, id = 'gpt-6-astra') => ({ provider, id, api: 'openai-codex-responses', name: id,
  contextWindow: 272000, maxTokens: 32000, input: ['text','image'] });
const request = extra => ({ model: model('codex-auto'), thinkingLevel: 'high', reason: 'user', ...extra });
const registry = { find: (provider, id) => model(provider, id),
  getProviderAuth: async provider => ({ auth: { apiKey: credentials[provider].access } }) };

 test('quota is the minimum of all observed windows, including additional limits', () => {
  assert.equal(parseRemaining(usage(), now), 60);
  assert.equal(parseRemaining(usage(0, null), now), 100);
  assert.equal(parseRemaining({...usage(), additional_rate_limits:[{limit_name:'other', rate_limit:limit(88)}]}, now), 12);
  assert.equal(parseRemaining({rate_limit:{allowed:false, limit_reached:true}}, now), 0);
 });
 test('unknown, malformed and expired windows fail closed without invented resets', () => {
  for (const value of [null, {}, {rate_limit:{}}, {rate_limit:{...limit(),allowed:'true'}},
    usage('20'), usage(-1), usage(101), usage(NaN),
    {rate_limit:{...limit(),primary_window:{used_percent:90,reset_at:now/1000-1}}},
    {...usage(),additional_rate_limits:{}}, {...usage(),additional_rate_limits:[{}]}]) assert.equal(parseRemaining(value, now), null);
 });
 test('selection chooses maximum conservative remaining; reserve/ties/unknown are deterministic', () => {
  assert.equal(chooseAccount([{provider:CODEX_SLOTS[0],remaining:10},{provider:CODEX_SLOTS[1],remaining:80}]).provider,CODEX_SLOTS[1]);
  assert.equal(chooseAccount([{provider:CODEX_SLOTS[2],remaining:60},{provider:CODEX_SLOTS[0],remaining:60}]).provider,CODEX_SLOTS[0]);
  assert.equal(chooseAccount([{provider:CODEX_SLOTS[0],remaining:5},{provider:CODEX_SLOTS[1],remaining:null},{provider:'openai',remaining:100}]),undefined);
 });
 test('quota service queries only separate OAuth Codex accounts; cache expires and force refresh works', async () => {
  let clock=now; const calls=[];
  const service=createQuotaService({readCredentials:()=>({...credentials,openai:{type:'api_key',key:'not-codex'}}),now:()=>clock,
    fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>usage()};}});
  const first=await service.observations(registry); assert.equal(calls.length,3);
  assert.deepEqual(first.map(item=>item.remaining),[60,60,60]);
  assert.equal(calls[1].options.headers['ChatGPT-Account-Id'],'fixture-1');
  assert.equal(calls[1].options.headers.Authorization,`Bearer ${jwt('fixture-1')}`);
  assert.equal(calls[0].url,'https://chatgpt.com/backend-api/wham/usage');
  assert(!JSON.stringify(first).includes('fixture-')); assert(!JSON.stringify(first).includes('Bearer'));
  await service.observations(registry);assert.equal(calls.length,3);
  clock+=CACHE_MS;await service.observations(registry);assert.equal(calls.length,6);
  await service.observations(registry,{force:true});assert.equal(calls.length,9);
 });
 test('duplicate accounts, API credentials, unknown slots and token mismatches are excluded', async()=>{
  const auth={...credentials,[CODEX_SLOTS[1]]:credentials[CODEX_SLOTS[0]],
    [CODEX_SLOTS[2]]:{...credentials[CODEX_SLOTS[2]],access:jwt('different')},
    'openai-codex-4':{type:'oauth',access:jwt('fourth'),accountId:'fourth'}};
  const calls=[];const service=createQuotaService({readCredentials:()=>auth,now:()=>now,
    fetchImpl:async()=>{calls.push(1);return {ok:true,json:async()=>usage()};}});
  assert.deepEqual((await service.observations(registry)).map(item=>item.provider),[CODEX_SLOTS[0]]);
  assert.equal(calls.length,1);
  auth[CODEX_SLOTS[0]]={type:'api_key',key:'not-codex'};
  assert.deepEqual(await service.observations({...registry,getProviderAuth:async()=>({auth:{apiKey:jwt('mismatch')}})}),
    [{provider:CODEX_SLOTS[1],remaining:null,status:'authentication unavailable',timestamp:now}]);
 });
 test('HTTP failure and thrown secrets are sanitized and unknown, not an automatic fallback', async()=>{
  const auth={[CODEX_SLOTS[0]]:credentials[CODEX_SLOTS[0]]};
  for(const fetchImpl of [async()=>({ok:false,status:401}),async()=>{throw Error('Bearer private token');}]) {
    const service=createQuotaService({readCredentials:()=>auth,fetchImpl,now:()=>now});
    const observations=await service.observations(registry);
    assert.equal(observations[0].remaining,null);assert(!JSON.stringify(observations).includes('private'));
    assert.equal(chooseAccount(observations),undefined);
  }
 });
 test('concurrent polls coalesce and missing models are not polled', async()=>{
  let calls=0;const service=createQuotaService({readCredentials:()=>credentials,now:()=>now,
    fetchImpl:async()=>{calls++;return {ok:true,json:async()=>usage()};}});
  const restricted={...registry,find:(provider,id)=>provider===CODEX_SLOTS[1]?model(provider,id):undefined};
  await Promise.all([service.observations(restricted,{modelId:'gpt-6-astra'}),service.observations(restricted,{modelId:'gpt-6-astra'})]);
  assert.equal(calls,1);
 });
 test('new turns preserve physical model/thinking, tool continuations and failed retries stay pinned without polling', async()=>{
  let polls=0;const service={observations:async()=>{polls++;return [{provider:CODEX_SLOTS[2],remaining:80}];}};
  for(const id of AUTO_MODELS) {
    const selected=await routeCodex(request({model:model('codex-auto',id),thinkingLevel:'xhigh'}),registry,service);
    assert.equal(selected.model.provider,CODEX_SLOTS[2]);assert.equal(selected.model.id,id);assert.equal(selected.thinkingLevel,'xhigh');
  }
  const sticky={model:model(CODEX_SLOTS[0]),thinkingLevel:'high'};
  for(const reason of ['continuation','retry']) {
    const selected=await routeCodex(request({reason,previous:sticky,failed:sticky}),registry,service);
    assert.equal(selected.model.provider,CODEX_SLOTS[0]);
  }
  assert.equal(polls,3);
  const compacted=await routeCodex(request({reason:'continuation',state:{provider:CODEX_SLOTS[0],modelId:'gpt-6-astra'}}),registry,service);
  assert.equal(compacted.model.provider,CODEX_SLOTS[0]);assert.equal(polls,3);
  await assert.rejects(routeCodex(request({reason:'retry'}),registry,service),/routing failed/);
  assert.equal(polls,3);
 });
 test('unknown quota, wrong pinned model and aborted routing fail closed',async()=>{
  await assert.rejects(routeCodex(request(),registry,{observations:async()=>[]}),/No verified Codex slot/);
  await assert.rejects(routeCodex(request({reason:'continuation',previous:{model:model(CODEX_SLOTS[0],'gpt-6.1-sol')}}),registry,{}),/identity changed/);
  let calls=0;const controller=new AbortController();controller.abort();
  const service=createQuotaService({readCredentials:()=>credentials,fetchImpl:async()=>{calls++;},now:()=>now});
  await assert.rejects(routeCodex(request({signal:controller.signal}),registry,service),{name:'AbortError'});
  assert.equal(calls,0);
 });
 test('registration creates virtual models and status command without polling',()=>{
  const models=[],commands=[];registerCodexRouter({registerVirtualModel:value=>models.push(value),registerCommand:name=>commands.push(name)},
    {getModels:()=>AUTO_MODELS.map(id=>model(CODEX_SLOTS[0],id))},{observations:()=>{throw Error('must not poll');}});
  assert.deepEqual(models.map(value=>`${value.provider}/${value.id}`),AUTO_MODELS.map(id=>`codex-auto/${id}`));
  assert(models.every(value=>value.maxTokens===32000));assert.deepEqual(commands,['codex-auto-status']);
 });
