// Bounded correctness fixture: two real child initializations and six mocked
// quota GETs. No child prompts, model calls, real credentials or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import { CODEX_SLOTS } from './router.mjs';

let piDir=process.env.PI_CODEX_TEST_PI_DIR;
if(!piDir) try {
 const executable=execFileSync(process.platform==='win32'?'where':'which',['pi'],{encoding:'utf8'}).trim().split(/\r?\n/)[0];
 let candidate=path.dirname(fs.realpathSync(executable));
 while(candidate!==path.dirname(candidate)) {
  const manifest=path.join(candidate,'package.json');
  if(fs.existsSync(manifest)&&JSON.parse(fs.readFileSync(manifest,'utf8')).name==='@earendil-works/pi-coding-agent') {piDir=candidate;break;}
  candidate=path.dirname(candidate);
 }
} catch {}
const actualAgent=process.env.PI_CODING_AGENT_DIR||path.join(os.homedir(),'.pi/agent');
const factoryFile=path.join(actualAgent,'npm/node_modules/pi-subagents/src/runs/shared/child-session.js');
const installed=piDir&&fs.existsSync(path.join(piDir,'dist/index.js'))&&fs.existsSync(factoryFile);

test('real SDK + child factory resolve automatic models and dispatch exact models to slot 2 via mocked quota',
 {skip:!installed,timeout:30_000},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pi-codex-router-'));
  const oldDir=process.env.PI_CODING_AGENT_DIR,oldFetch=globalThis.fetch;
  const credentials=Object.fromEntries(CODEX_SLOTS.map((provider,i)=> {
   const accountId=`fixture-${i}`;
   const access=`fixture.${Buffer.from(JSON.stringify({'https://api.openai.com/auth':{chatgpt_account_id:accountId,chatgpt_plan_type:'pro'}})).toString('base64url')}.fixture`;
   return [provider,{type:'oauth',accountId,access,refresh:'fixture-never-refresh',expires:Date.now()+86400_000}];
  }));
  const authPath=path.join(root,'auth.json');fs.writeFileSync(authPath,JSON.stringify(credentials));
  fs.writeFileSync(path.join(root,'settings.json'),JSON.stringify({packages:[],retry:{enabled:false},compaction:{enabled:false},cacheWarming:'off'}));
  fs.writeFileSync(path.join(root,'models.json'),'{}');
  process.env.PI_CODING_AGENT_DIR=root;
  const calls=[],errors=[];
  globalThis.fetch=async(url,options)=>{
   assert.equal(url,'https://chatgpt.com/backend-api/wham/usage','unexpected network attempt');
   calls.push(options.headers['ChatGPT-Account-Id']);
   const used=options.headers['ChatGPT-Account-Id']==='fixture-1'?10:70;
   return {ok:true,json:async()=>({rate_limit:{allowed:true,limit_reached:false,
    primary_window:{used_percent:used,reset_at:Math.floor(Date.now()/1000)+3600},secondary_window:null}})};
  };
  let factory,aliasesHook;
  try {
   // Plain node does not have Pi's peer-module resolver. Use the package's
   // own detached-runner alias table; never install or copy peer packages.
   const {resolveHostPeerAliases}=await import(pathToFileURL(path.join(path.dirname(factoryFile),'../background/runner-aliases.js')).href);
   const {aliases,missing}=resolveHostPeerAliases(piDir);assert.deepEqual(missing,[]);
   aliasesHook=registerHooks({resolve(specifier,context,nextResolve) {
    return aliases[specifier]?{url:pathToFileURL(aliases[specifier]).href,shortCircuit:true}:nextResolve(specifier,context);
   }});
   const sdk=await import(pathToFileURL(path.join(piDir,'dist/index.js')).href);
   const {createDefaultChildSessionFactory}=await import(pathToFileURL(factoryFile).href);
   // No catalog discovery/network during initialization; all credentials are fixtures.
   const offlineSdk={...sdk,ModelRuntime:{create:options=>sdk.ModelRuntime.create({...options,
    authPath,modelsPath:path.join(root,'models.json'),modelsStorePath:path.join(root,'models-store.json'),
    allowModelNetwork:false,refreshOnCreate:false})}};
   factory=createDefaultChildSessionFactory({loadPiCodingAgent:async()=>offlineSdk});
   const extension=path.join(import.meta.dirname,'index.ts');
   for(const id of ['gpt-6-astra','gpt-6.1-sol']) {
    let ctx;
    const child=await factory.create({cwd:root,model:`codex-auto/${id}`,runtime:{},processEnv:{},
     storage:{kind:'memory'},ambientExtensions:false,extensionPaths:[extension],
     requiredExtensions:[{path:extension}],noSkills:true,noContextFiles:true,tools:['read'],
     hooks:[{name:'capture-context',factory:pi=>pi.on('session_start',(_event,context)=>{ctx=context;})}],
     onExtensionError:error=>errors.push(String(error.error))});
    try {
     assert.equal(child.virtualModelId,`codex-auto/${id}`);
     const route=await ctx.modelRegistry.runtime.resolveModel(ctx.model,[],{reason:'user',thinkingLevel:'high'});
     assert.equal(route.model.provider,'openai-codex-2');assert.equal(route.model.id,id);assert.equal(route.thinkingLevel,'high');
    } finally {await child.dispose();}
   }
   assert.deepEqual(errors,[]);assert.equal(calls.length,6);
   assert.equal(fs.readFileSync(authPath,'utf8'),JSON.stringify(credentials));
  } finally {
   await factory?.dispose();aliasesHook?.deregister();globalThis.fetch=oldFetch;
   if(oldDir===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=oldDir;
   fs.rmSync(root,{recursive:true,force:true});
  }
 });
