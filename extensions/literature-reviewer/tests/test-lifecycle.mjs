import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runProcess} from './runner.mjs';
import {formatFailure} from './runtime.mjs';
const end="console.log(JSON.stringify({type:'message_end',message:{role:'assistant',content:[{type:'text',text:'done'}],stopReason:'stop'}}));";
function workspace(t) { const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lit-lifecycle-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir; }
function run(t,body,options={}) { const runDir=workspace(t);return runProcess({command:process.execPath,args:['--input-type=module','-e',body],cwd:runDir,runDir,env:{...process.env,PI_LITERATURE_DEPTH:'1'},task:'fixture',timeoutMs:null,...options}); }
test('unbounded coordinator finishes normally with null budget and persisted status',async t=>{
  const r=await run(t,`await new Promise(r=>setTimeout(r,100));${end}`);
  assert(r.ok);assert.equal(r.deadlineAt,null);assert.equal(r.budgetMs,null);
  const status=JSON.parse(fs.readFileSync(path.join(r.runDir,'progress.json')));
  assert.equal(status.status,'finished');
});
test('unbounded mode is rejected for leaves and unspecified roles',async t=>{
  for(const depth of ['0','2',undefined]) {
    const env={...process.env};if(depth===undefined)delete env.PI_LITERATURE_DEPTH;else env.PI_LITERATURE_DEPTH=depth;
    await assert.rejects(run(t,end,{env}),/Only the coordinator/);
  }
});
test('heartbeat exposes silence/checkpoint and user cancellation still stops unbounded coordinator',async t=>{
  const ac=new AbortController();let heartbeats=0;
  const safety=setTimeout(()=>ac.abort(),3000);t.after(()=>clearTimeout(safety));
  const r=await run(t,"import fs from 'node:fs';fs.writeFileSync('report.md','checkpoint');setInterval(()=>{},1000);",{
    signal:ac.signal,heartbeatMs:20,onProgress:(_calls,s)=>{
      assert.equal(s.remainingMs,null);
      if(s.checkpoint && ++heartbeats>=2)ac.abort();
    }});
  assert(heartbeats>=2);assert.equal(r.error,'Cancelled');assert.equal(fs.readFileSync(r.report,'utf8'),'checkpoint');
  assert.match(formatFailure(r),/no wall-clock deadline/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(r.runDir,'progress.json'))).status,'incomplete');
});
test('leaf timeout does not terminate its unbounded coordinator',async t=>{
  const body=`import fs from 'node:fs';import {runProcess} from ${JSON.stringify(new URL('./runner.mjs',import.meta.url).href)};
    fs.mkdirSync('leaf');const r=await runProcess({command:process.execPath,args:['-e','setInterval(()=>{},1000)'],cwd:process.cwd(),runDir:process.cwd()+'/leaf',env:{...process.env,PI_LITERATURE_DEPTH:'2'},task:'leaf',timeoutMs:100,detached:false});
    if(r.error!=='Time limit exceeded')throw new Error('leaf did not time out');
    fs.writeFileSync('report.md','Integrated partial child results');${end}`;
  const r=await run(t,body);assert(r.ok);assert.equal(r.text,'Integrated partial child results');
});
