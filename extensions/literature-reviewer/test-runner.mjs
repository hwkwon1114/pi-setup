import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {depthFrom,buildArgs,runProcess} from './runner.mjs';
import {formatFailure} from './runtime.mjs';
import {progressUpdate} from './progress.mjs';
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'lit-reviewer-test-'));
const emit="console.log(JSON.stringify({type:'message_end',message:{role:'assistant',content:[{type:'text',text:'fixture report'}],stopReason:'stop'}}));";
test('depth validation',()=>{assert.equal(depthFrom({}),0);assert.equal(depthFrom({PI_LITERATURE_DEPTH:'2'}),2);for(const n of ['-1','3','abc','1.5'])assert.throws(()=>depthFrom({PI_LITERATURE_DEPTH:n}));});
test('explicit role configuration and leaf tools',()=>{
 const root=temp();for(const n of ['research-ideas','pdf-read']){const d=n==='research-ideas'?path.join(root,'roles','literature-reviewer','skills',n):path.join(root,'skills',n);fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,'SKILL.md'),'fixture');}
 for(const depth of [1,2]) {const args=buildArgs({cli:'pi.js',extension:'index.ts',agentDir:root,promptFile:'role.md',model:'provider/model',depth});assert(args.includes('--no-extensions'));assert(args.includes('--no-skills'));assert(args.includes('--no-context-files'));assert.equal(args.filter(x=>x==='--skill').length,2);assert.equal(args[args.indexOf('--tools')+1].includes('literature_review'),depth===1);assert(!args.join(' ').includes('zotero'));}
 fs.rmSync(root,{recursive:true});
});
test('coordinator stays Astra/xhigh and leaves use Sol/medium',t=>{
 const source=fs.readFileSync(new URL('./index.ts',import.meta.url),'utf8');
 const routing=source.match(/const model=dispatchedDepth===1[\s\S]*?const thinking=[^;]+;/)?.[0];
 assert(routing,'explicit model/thinking routing must exist');
 // Evaluate the actual dispatch declarations, not a duplicated routing table.
 const select=new Function('dispatchedDepth',routing+'return {model,thinking};');
 const root=temp();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const rel of ['roles/literature-reviewer/skills/research-ideas','skills/pdf-read']) {
  const dir=path.join(root,rel);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'SKILL.md'),'fixture');
 }
 for(const [depth,model,thinking] of [[1,'openai-codex/gpt-6-astra','xhigh'],[2,'openai-codex/gpt-6-sol','medium']]) {
  const selected=select(depth);assert.deepEqual(selected,{model,thinking});
  const args=buildArgs({cli:'pi.js',extension:'index.ts',agentDir:root,promptFile:'role.md',depth,...selected});
  assert.equal(args[args.indexOf('--model')+1],model);
  assert.equal(args[args.indexOf('--thinking')+1],thinking);
  assert.equal(args[args.indexOf('--tools')+1].split(',').includes('literature_review'),depth===1);
 }
 assert.throws(()=>buildArgs({cli:'pi.js',agentDir:root,model:'openai-codex/gpt-6-sol',thinking:'medium',depth:3}),/Delegation depth exceeded/);
 assert.match(source,/leaf retrieval reviewers use Sol medium/);
 for(const file of ['README.md','literature-reviewer.md']) {
  const text=fs.readFileSync(new URL(file,import.meta.url),'utf8');
  assert.match(text,/Sol\/medium/);assert.doesNotMatch(text,/Luna|gpt-5\.6-luna/);
 }
});
test('successful child stores report',async()=>{const root=temp();const r=await runProcess({command:process.execPath,args:['-e',emit],cwd:root,env:process.env,task:'fixture',runDir:root,timeoutMs:2000});assert(r.ok);assert.equal(fs.readFileSync(r.report,'utf8'),'fixture report');fs.rmSync(root,{recursive:true});});
test('nonzero child fails even with report',async()=>{const root=temp();const r=await runProcess({command:process.execPath,args:['-e',emit+'process.exitCode=1;'],cwd:root,env:process.env,task:'fixture',runDir:root,timeoutMs:2000});assert(!r.ok);fs.rmSync(root,{recursive:true});});
test('timeout is partial failure',async()=>{const root=temp();const r=await runProcess({command:process.execPath,args:['-e','setInterval(()=>{},1000)'],cwd:root,env:process.env,task:'fixture',runDir:root,timeoutMs:80});assert(!r.ok);assert.match(r.error,/Time limit/);fs.rmSync(root,{recursive:true});});
test('output cap stops child',async()=>{const root=temp();const r=await runProcess({command:process.execPath,args:['-e','console.log("x".repeat(10000))'],cwd:root,env:process.env,task:'fixture',runDir:root,outputLimit:1000,timeoutMs:2000});assert(!r.ok);assert.match(r.error,/Output limit/);fs.rmSync(root,{recursive:true});});
test('pre-aborted signal never spawns',async()=>{const root=temp();await assert.rejects(runProcess({command:process.execPath,args:[],cwd:root,env:process.env,task:'fixture',runDir:root,signal:AbortSignal.abort()}),/Cancelled/);assert.equal(fs.readdirSync(root).length,0);fs.rmSync(root,{recursive:true});});

const authored='# Partial scientific findings\nPrimary source checked: fixture, p. 3. Remaining route: blocked.\n';
const saveReport=`require('node:fs').writeFileSync('report.md',${JSON.stringify(authored)});`;
const toolUse="console.log(JSON.stringify({type:'message_end',message:{role:'assistant',content:[{type:'text',text:'Retrieving more evidence'},{type:'toolCall',id:'1',name:'fixture',arguments:{}}],stopReason:'toolUse'}}));";
const ready="console.log(JSON.stringify({type:'tool_execution_start',toolName:'fixture'}));";
function fixture(t, body, options={}) {
  const root=temp();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  return runProcess({command:process.execPath,args:['-e',body],cwd:root,env:process.env,
    task:'offline fixture',runDir:root,timeoutMs:2000,...options});
}

test('progress tolerates missing or invalid timing from older runners',()=>{
  for(const timing of [undefined,null,{}, {remainingMs:NaN}, {remainingMs:Infinity}, {remainingMs:'1000'}]) {
    const update=progressUpdate(3,timing,'/fixture',5000,1000);
    assert.match(update.content[0].text,/3 tool calls, 4s remaining/);
    assert.equal(update.details.remainingMs,4000);
    assert.equal(update.details.runDir,'/fixture');
  }
  assert.equal(progressUpdate(1,undefined,'/fixture',5000,6000).details.remainingMs,0);
  assert.equal(progressUpdate(1,{remainingMs:0},'/fixture',5000,1000).details.remainingMs,0);
  const update=progressUpdate(2,{elapsedMs:100,remainingMs:1501},'/fixture',5000,1000);
  assert.match(update.content[0].text,/2s remaining/);
  assert.equal(update.details.elapsedMs,100);
});

test('runner supplies finite timing to progress callbacks',async t=>{
  const updates=[];
  const r=await fixture(t,ready+ready+emit,{onProgress:(calls,timing)=>updates.push({calls,...timing})});
  assert(r.ok);assert.deepEqual(updates.map(u=>u.calls),[1,2]);
  for(const u of updates) {
    assert(Number.isFinite(u.elapsedMs));assert(u.elapsedMs>=0);
    assert(Number.isFinite(u.remainingMs));assert(u.remainingMs>=0);
    assert.equal(u.elapsedMs+u.remainingMs,r.budgetMs);
  }
});

for(const trailing of [false,true]) test(`throwing progress callback preserves handoff (trailing event: ${trailing})`,async t=>{
  let calls=0;
  const event=trailing ? "process.stdout.write(JSON.stringify({type:'tool_execution_start'}));" : ready+ready+'setInterval(()=>{},1000);';
  const r=await fixture(t,saveReport+event,{onProgress:()=>{calls++;throw new TypeError('fixture progress failure');}});
  assert(!r.ok);assert.equal(calls,1);
  assert.equal(r.error,'Progress callback failed: fixture progress failure');
  assert.equal(fs.readFileSync(r.report,'utf8'),authored);
  assert.equal(JSON.parse(fs.readFileSync(path.join(r.runDir,'result.json'),'utf8')).error,r.error);
  assert(fs.existsSync(r.artifactManifest));
});

for(const mode of ['success','nonzero','timeout','cancelled','output-limit']) {
  test(`authored report survives ${mode}; runner uses a separate final response`,async t=>{
    const ac=new AbortController();
    const endings={success:emit,nonzero:emit+'process.exitCode=7;',
      timeout:toolUse+'setInterval(()=>{},1000);',
      cancelled:toolUse+ready+'setInterval(()=>{},1000);',
      'output-limit':toolUse+'console.log("x".repeat(10000));'};
    const r=await fixture(t,saveReport+endings[mode],{timeoutMs:mode==='timeout'?500:2000,
      signal:ac.signal,onProgress:()=>{if(mode==='cancelled')ac.abort();},
      outputLimit:mode==='output-limit'?1000:64*1024*1024});
    assert.equal(r.ok,mode==='success');
    assert.equal(fs.readFileSync(path.join(r.runDir,'report.md'),'utf8'),authored);
    assert.equal(r.report,path.join(r.runDir,'report.md'));
    assert.equal(r.text,authored);
    assert.notEqual(r.finalResponse,r.report);
    assert(fs.existsSync(r.artifactManifest));
    assert(r.artifacts.some(a=>a.path===r.report && a.status==='available'));
    if(mode==='success'||mode==='nonzero') assert.equal(fs.readFileSync(r.finalResponse,'utf8'),'fixture report');
    else assert.equal(fs.readFileSync(r.finalResponse,'utf8'),'(No completed final response)\n');
    if(mode==='timeout') {
      assert.equal(r.error,'Time limit exceeded');assert.equal(r.stopReason,'toolUse');
      assert.match(formatFailure(r),/incomplete: Time limit exceeded/);
      assert(formatFailure(r).includes(r.report));assert(formatFailure(r).includes(authored.trim()));
      assert(r.elapsedMs>=400);assert(r.elapsedMs<2000);
    }
    if(mode==='nonzero')assert.equal(r.error,'Child exited with code 7');
    if(mode==='cancelled')assert.equal(r.error,'Cancelled');
    if(mode==='output-limit')assert.equal(r.error,'Output limit exceeded');
  });
}

test('post-timeout model error cannot obscure launcher cause',async t=>{
  const handler="process.on('SIGTERM',()=>{console.log(JSON.stringify({type:'message_end',message:{role:'assistant',content:[],stopReason:'aborted',errorMessage:'Model aborted'}}));process.exit(0);});";
  const r=await fixture(t,saveReport+handler+toolUse+'setInterval(()=>{},1000);',{timeoutMs:500});
  assert.equal(r.error,'Time limit exceeded');assert.equal(r.stopReason,'aborted');assert(!r.ok);
});

test('absolute deadline can shorten but not extend the runner timeout',async t=>{
  const deadlineAt=Date.now()+400;
  const r=await fixture(t,saveReport+'setInterval(()=>{},1000);',{deadlineAt,timeoutMs:2000});
  assert.equal(r.deadlineAt,deadlineAt);assert.equal(r.error,'Time limit exceeded');assert(r.elapsedMs<1500);
  const laterDeadline=Date.now()+5000;
  const capped=await fixture(t,'setInterval(()=>{},1000);',{deadlineAt:laterDeadline,timeoutMs:200});
  assert(capped.deadlineAt<laterDeadline);assert.equal(capped.budgetMs,200);assert(capped.elapsedMs<1500);
});

test('expired deadline is rejected before spawn',async t=>{
  const root=temp();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  await assert.rejects(runProcess({command:process.execPath,args:['-e',emit],cwd:root,env:process.env,
    task:'fixture',runDir:root,deadlineAt:Date.now()-1}),/deadline/);
  assert.deepEqual(fs.readdirSync(root),[]);
});

test('missing declared deliverable cannot appear as a complete handoff',async t=>{
  const manifest={version:1,status:'complete_within_scope',report:'report.md',artifacts:['missing-route-ledger.md']};
  const r=await fixture(t,saveReport+`require('node:fs').writeFileSync('handoff.json',${JSON.stringify(JSON.stringify(manifest))});`+emit);
  assert(!r.ok);assert(r.processCompleted);assert.match(r.error,/Artifact handoff incomplete/);
  assert(r.artifacts.some(a=>a.status==='missing' && a.path.endsWith('missing-route-ledger.md')));
  assert.equal(fs.readFileSync(r.report,'utf8'),authored);
});

test('partial declared scope is not silently upgraded by process success',async t=>{
  const manifest={version:1,status:'partial',report:'report.md',artifacts:[]};
  const r=await fixture(t,saveReport+`require('node:fs').writeFileSync('handoff.json',${JSON.stringify(JSON.stringify(manifest))});`+emit);
  assert(r.ok);assert(r.processCompleted);assert.equal(r.declaredStatus,'partial');
});

test('malformed manifest remains a failed handoff with a recoverable report',async t=>{
  const r=await fixture(t,saveReport+"require('node:fs').writeFileSync('handoff.json','{unfinished');"+emit);
  assert(!r.ok);assert(r.artifactErrors.some(e=>e.includes('Invalid handoff.json')));assert.equal(r.text,authored);
});

test('tool commentary and streaming deltas are never promoted to final answers',async t=>{
  const delta="console.log(JSON.stringify({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'unverified draft'}}));";
  const r=await fixture(t,delta+toolUse);
  assert(!r.ok);assert.equal(r.report,null);assert.equal(r.text,'');
  assert.equal(fs.readFileSync(r.finalResponse,'utf8'),'(No completed final response)\n');
});

test('non-event JSON is ignored and a missing stop reason is not borrowed from an earlier answer',async t=>{
  const malformed="console.log('null');console.log('[]');console.log(JSON.stringify({type:'message_end',message:{role:'assistant',content:{unexpected:true}}}));";
  const r=await fixture(t,saveReport+emit+malformed);
  assert(!r.ok);assert.equal(r.text,authored);
  assert.equal(fs.readFileSync(r.finalResponse,'utf8'),'(No completed final response)\n');
});

test('spawn failure exposes its actual cause and saves runtime recovery metadata',async t=>{
  const r=await fixture(t,'',{command:'/nonexistent/offline-test-pi'});
  assert(!r.ok);assert.match(r.error,/Failed to launch Pi subprocess:.*ENOENT/);
  assert(fs.existsSync(r.artifactManifest));assert.equal(r.report,null);
});

test('split UTF-8 final response decodes correctly',async t=>{
  const payload=JSON.stringify({type:'message_end',message:{role:'assistant',content:[{type:'text',text:'π source'}],stopReason:'stop'}})+'\n';
  const body=`const b=Buffer.from(${JSON.stringify(payload)});const i=b.indexOf(Buffer.from('π'))+1;process.stdout.write(b.subarray(0,i));setTimeout(()=>process.stdout.write(b.subarray(i)),10);`;
  const r=await fixture(t,body);assert(r.ok);assert.equal(r.text,'π source');
});

test('truncated JSON event cannot damage an already authored report',async t=>{
  const r=await fixture(t,saveReport+"process.stdout.write('{\"type\":\"message_end\"');");
  assert(!r.ok);assert.equal(r.text,authored);assert.equal(fs.readFileSync(r.report,'utf8'),authored);
});

test('reserved final-response collision fails without overwriting either authored file',async t=>{
  const root=temp();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  await assert.rejects(runProcess({command:process.execPath,
    args:['-e',saveReport+"require('node:fs').writeFileSync('final-response.md','reserved-file violation');"+emit],
    cwd:root,env:process.env,task:'fixture',runDir:root,timeoutMs:2000}),/Authored reports were not overwritten/);
  assert.equal(fs.readFileSync(path.join(root,'report.md'),'utf8'),authored);
  assert.equal(fs.readFileSync(path.join(root,'final-response.md'),'utf8'),'reserved-file violation');
});

test('POSIX root timeout cleans up a descendant that ignores TERM and closes inherited stdio',
  {skip:process.platform==='win32'},async t=>{
    const root=temp();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    let pid;
    t.after(()=>{if(pid){try{process.kill(pid,'SIGKILL');}catch{}}});
    const leaf="process.on('SIGTERM',()=>{});require('node:fs').writeFileSync('descendant.pid',String(process.pid));setInterval(()=>{},1000);";
    const body=`require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{stdio:'ignore'});setInterval(()=>{},1000);`;
    const r=await runProcess({command:process.execPath,args:['-e',body],cwd:root,env:process.env,task:'fixture',runDir:root,timeoutMs:600});
    assert.equal(r.error,'Time limit exceeded');
    pid=Number(fs.readFileSync(path.join(root,'descendant.pid'),'utf8'));
    const gone=()=>{try{process.kill(pid,0);return false;}catch(e){return e.code==='ESRCH';}};
    for(let i=0;i<30&&!gone();i++)await new Promise(resolve=>setTimeout(resolve,20));
    assert(gone(),'descendant must not survive the stopped root');pid=undefined;
  });
