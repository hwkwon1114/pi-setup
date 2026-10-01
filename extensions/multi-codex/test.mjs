import test from 'node:test';
import assert from 'node:assert/strict';
import multiCodex, {createCodexAlias} from './index.ts';
import {createAssistantMessageEventStream} from '../multi-openai/index.ts';
function fixture() {
  const calls=[];
  const message={role:'assistant',provider:'openai-codex',model:'test',content:[],stopReason:'stop'};
  const stream=(model,context,options)=>{
    calls.push({model,context,options});
    const result=createAssistantMessageEventStream();
    result.push({type:'done',reason:'stop',message});result.end();return result;
  };
  const oauth={name:'native',login:async()=>({accountId:'fixture'}),refresh:async c=>c,toAuth:async c=>({apiKey:c.access})};
  return {calls,native:{id:'openai-codex',baseUrl:'https://chatgpt.com/backend-api',auth:{oauth},getModels:()=>[{id:'test',provider:'openai-codex'}],stream,streamSimple:stream}};
}
test('Codex alias delegates OAuth and rewrites model, history and result',async()=>{
  const {native,calls}=fixture();const alias=createCodexAlias(native,2);
  assert.equal(alias.id,'openai-codex-2');
  assert.equal(alias.getModels()[0].provider,alias.id);
  assert.deepEqual(await alias.auth.oauth.refresh({access:'fixture'}),{access:'fixture'});
  assert.deepEqual(await alias.auth.oauth.toAuth({access:'fixture'}),{apiKey:'fixture'});
  const options={fixture:true};
  const result=await alias.streamSimple(alias.getModels()[0],{messages:[{role:'assistant',provider:'openai-codex-2'}]},options).result();
  assert.equal(calls[0].model.provider,'openai-codex');
  assert.equal(calls[0].context.messages[0].provider,'openai-codex');
  assert.equal(calls[0].options,options);
  assert.equal(result.provider,'openai-codex-2');
});
test('commands register Codex slot without editing auth or registering OpenAI aliases',async()=>{
  const {native}=fixture();const commands={},providers=[];
  await multiCodex({registerProvider:p=>providers.push(p.id),on:()=>{},registerCommand:(n,c)=>commands[n]=c},native);
  assert.deepEqual(providers,['openai-codex-2']);
  let notice;
  await commands['codex-add'].handler('',{ui:{notify:s=>notice=s}});
  assert.match(notice,/\/login openai-codex-2/);
  assert.ok(commands['codex-status']);assert.ok(commands['codex-switch']);
});
