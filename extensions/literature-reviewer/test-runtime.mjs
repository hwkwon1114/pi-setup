import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REVIEW_TIMEOUT_MS, CHILD_TIMEOUT_MS, MIN_CHILD_MS,
  budgetFrom, planBudget, budgetNotice, registerBudgetHooks, collectArtifacts } from './runtime.mjs';

const now=1000000;
test('coordinator has an explicit unbounded budget, not an absent/malformed budget',()=>{
  const root=planBudget({depth:1,now});
  assert.equal(root.deadlineAt,null);assert.equal(root.finalizeAt,null);assert.equal(root.timeoutMs,null);
  assert.deepEqual(budgetFrom({PI_LITERATURE_DEADLINE_MS:'none',PI_LITERATURE_FINALIZE_MS:'none'}),{deadlineAt:null,finalizeAt:null});
  assert.match(budgetNotice(root,now),/no wall-clock deadline/);
});
test('leaf gets a fresh independent ten minutes even long after coordinator dispatch',()=>{
  const parentBudget=planBudget({depth:1,now});
  for(const delay of [0,900000,3600000]) {
    const child=planBudget({depth:2,now:now+delay,parentBudget});
    assert.equal(child.timeoutMs,CHILD_TIMEOUT_MS);
    assert.equal(child.deadlineAt,now+delay+600000);
    assert.equal(child.deadlineAt-child.finalizeAt,60000);
  }
});
test('legacy finite parent budgets still preserve their finalization reserve',()=>{
  const parentBudget={deadlineAt:now+900000,finalizeAt:now+600000};
  for(const delay of [0,120000,540000]) {
    const child=planBudget({depth:2,now:now+delay,parentBudget});
    assert.equal(child.deadlineAt,parentBudget.finalizeAt);
    assert(child.finalizeAt<child.deadlineAt);
    assert(child.timeoutMs>=MIN_CHILD_MS);assert(child.timeoutMs<REVIEW_TIMEOUT_MS);
  }
  assert.throws(()=>planBudget({depth:2,now:parentBudget.finalizeAt-MIN_CHILD_MS+1,parentBudget}),/Insufficient/);
  assert.throws(()=>planBudget({depth:2,now:parentBudget.deadlineAt+1,parentBudget}),/Insufficient/);
});
test('missing or malformed inherited budgets fail closed for new dispatch',()=>{
  assert.equal(budgetFrom({}),undefined);
  const env={PI_LITERATURE_DEADLINE_MS:'2000000',PI_LITERATURE_FINALIZE_MS:'1800000'};
  assert.deepEqual(budgetFrom(env),{deadlineAt:2000000,finalizeAt:1800000});
  for(const value of ['NaN','Infinity','0','-1','1.2'])assert.throws(()=>budgetFrom({...env,PI_LITERATURE_DEADLINE_MS:value}));
  assert.throws(()=>budgetFrom({PI_LITERATURE_DEADLINE_MS:'2000000'}));
  assert.throws(()=>budgetFrom({...env,PI_LITERATURE_FINALIZE_MS:'2100000'}));
  assert.throws(()=>planBudget({depth:2,now}),/Parent deadline unavailable/);
  assert.throws(()=>planBudget({depth:3,now}));
  assert.throws(()=>planBudget({depth:2,now,parentBudget:{deadlineAt:2000000,finalizeAt:Infinity}}));
});
test('runtime notices report remaining time and switch to explicit finalization',()=>{
  const root=planBudget({depth:2,now,parentBudget:planBudget({depth:1,now})});
  assert.match(budgetNotice(root,now),/600s remaining/);
  assert.match(budgetNotice(root,root.finalizeAt),/FINALIZE NOW/);
  assert.match(budgetNotice(root,root.deadlineAt+1),/0s remaining/);
});
test('budget context is ephemeral, refreshed and nonduplicating; finalization blocks retrieval only',()=>{
  const handlers=new Map();const pi={on:(name,handler)=>handlers.set(name,handler)};
  const budget=planBudget({depth:2,now,parentBudget:planBudget({depth:1,now})});let clock=now;
  registerBudgetHooks(pi,budget,()=>clock);
  const original=[{role:'user',content:'essential question',timestamp:now}];
  const first=handlers.get('context')({messages:original});
  assert.equal(original.length,1);assert.equal(first.messages.length,2);
  assert.equal(first.messages[1].role,'custom');assert.equal(first.messages[1].display,false);
  assert.equal(handlers.get('tool_call')({toolName:'mcp'}),undefined);
  clock=budget.finalizeAt;
  const second=handlers.get('context')({messages:first.messages});
  assert.equal(second.messages.length,2);assert.match(second.messages[1].content,/FINALIZE NOW/);
  for(const toolName of ['mcp','literature_review'])assert(handlers.get('tool_call')({toolName}).block);
  for(const toolName of ['read','write','edit','bash'])assert.equal(handlers.get('tool_call')({toolName}),undefined);
  // Bash remains task-scoped by role instructions; this hook is not a network sandbox.
});
test('main session without a review budget gets no injected hooks',()=>{
  let calls=0;registerBudgetHooks({on:()=>calls++},undefined);assert.equal(calls,0);
});

function workspace(t) {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'lit-artifacts-test-'));
  t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
  const runDir=path.join(base,'runs','review'),cwd=path.join(base,'project');
  fs.mkdirSync(runDir,{recursive:true});fs.mkdirSync(cwd);
  const manifest=h=>fs.writeFileSync(path.join(runDir,'handoff.json'),JSON.stringify({version:1,status:'partial',artifacts:[],...h}));
  return {base,runDir,cwd,manifest};
}
test('local report and declared files are validated, missing paths remain explicit',t=>{
  const w=workspace(t);fs.writeFileSync(path.join(w.runDir,'report.md'),'findings');
  w.manifest({report:'report.md',artifacts:['not-yet-written.md']});
  const r=collectArtifacts(w);
  assert.equal(r.report,path.join(w.runDir,'report.md'));assert.equal(r.declaredStatus,'partial');
  assert(r.artifacts.some(a=>a.status==='missing'));assert.equal(r.errors.length,1);
});
test('external project paths are permitted only for the top reviewer and are not auto-read',t=>{
  const w=workspace(t);const external=path.join(w.cwd,'project-report.md');
  fs.writeFileSync(external,'PRIVATE BODY NOT TO BE AUTO-READ');w.manifest({report:external});
  const leaf=collectArtifacts(w);assert(leaf.errors.some(e=>e.includes('outside allowed')));assert.equal(leaf.report,null);
  const root=collectArtifacts({...w,allowProjectArtifacts:true});
  assert.deepEqual(root.errors,[]);assert.equal(root.report,external);assert.equal(root.localReport,null);
  assert(!JSON.stringify(root).includes('PRIVATE BODY'));
});
test('outside-root traversal and direct symlinks are rejected without reading targets',t=>{
  const w=workspace(t);const outside=path.join(w.base,'outside.md');fs.writeFileSync(outside,'PRIVATE TARGET');
  fs.symlinkSync(outside,path.join(w.runDir,'report.md'));
  w.manifest({report:path.relative(w.runDir,outside)});
  const r=collectArtifacts(w);
  assert.equal(r.report,null);assert.equal(r.errors.length,2);
  assert(!JSON.stringify(r).includes('PRIVATE TARGET'));
});
test('symlinked parent directory cannot escape allowed artifact roots',t=>{
  const w=workspace(t);fs.writeFileSync(path.join(w.cwd,'external.md'),'external');
  fs.symlinkSync(w.cwd,path.join(w.runDir,'alias'));
  w.manifest({report:'alias/external.md'});
  const r=collectArtifacts(w);assert.equal(r.report,null);assert(r.errors.some(e=>e.includes('outside allowed')));
});
test('symlinked handoff manifest is rejected before JSON content is read',t=>{
  const w=workspace(t);const outside=path.join(w.base,'outside.json');fs.writeFileSync(outside,'PRIVATE invalid JSON');
  fs.symlinkSync(outside,path.join(w.runDir,'handoff.json'));
  const r=collectArtifacts(w);assert(r.errors.some(e=>e.includes('non-symlink')));
  assert(!r.errors.some(e=>e.includes('JSON')));
});
test('handoff schema, size, count and file-type limits are enforced',t=>{
  const w=workspace(t);
  for(const h of [{version:2},{status:'complete'},{artifacts:'report.md'},
    {artifacts:new Array(129).fill('report.md')},{report:42}]) {
    w.manifest(h);assert(collectArtifacts(w).errors.some(e=>e.includes('invalid handoff schema')));
  }
  fs.writeFileSync(path.join(w.runDir,'handoff.json'),' '.repeat(65537));
  assert(collectArtifacts(w).errors.some(e=>e.includes('exceeds 64 KiB')));
  w.manifest({artifacts:['.']});assert(collectArtifacts(w).errors.some(e=>e.includes('not a regular')));
  w.manifest({artifacts:[null]});assert(collectArtifacts(w).errors.includes('Invalid artifact path'));
});
test('broken report symlink is an error, not a silently absent report',t=>{
  const w=workspace(t);fs.symlinkSync('absent.md',path.join(w.runDir,'report.md'));
  const r=collectArtifacts(w);assert.equal(r.report,null);assert.equal(r.errors.length,1);
});
