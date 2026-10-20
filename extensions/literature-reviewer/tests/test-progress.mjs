import test from 'node:test';
import assert from 'node:assert/strict';
import {createProgress,progressUpdate} from './progress.mjs';
import {planBudget,registerBudgetHooks} from './runtime.mjs';

test('unbounded progress is explicit and missing scientific counts stay missing',()=>{
  const p=progressUpdate(0,{elapsedMs:900001},'/run',null);
  assert.equal(p.details.remainingMs,null);
  assert.match(p.content[0].text,/no wall-clock deadline/);
  assert.doesNotMatch(p.content[0].text,/NaN|Infinity|Papers/);
});
test('coordinator never hits a retrieval cutoff',()=>{
  const hooks=new Map();
  registerBudgetHooks({on:(k,v)=>hooks.set(k,v)},planBudget({depth:1,now:1000}),()=>999999999);
  assert.equal(hooks.get('tool_call')({toolName:'mcp'}),undefined);
  assert.equal(hooks.get('tool_call')({toolName:'literature_review'}),undefined);
});
test('concurrent children retain independent statuses and checkpoint metadata',()=>{
  const p=createProgress(1000);
  for(const id of ['a','b']) p.observe({type:'tool_execution_start',toolName:'literature_review',toolCallId:id},1100);
  p.observe({type:'tool_execution_update',toolCallId:'a',partialResult:{details:{runDir:'/run/a',phase:'retrieval',error:'Time limit exceeded'}}},1200);
  p.observe({type:'tool_execution_end',toolCallId:'a',isError:true},1300);
  let s=p.snapshot(1400);
  assert.equal(s.children[0].status,'timed out');assert.equal(s.children[1].status,'running');
  assert.deepEqual(s.activeTools,['literature_review']);
  p.observe({type:'tool_execution_end',toolCallId:'b',isError:false},1500);
  s=p.snapshot(190000);
  assert.equal(s.children[1].status,'completed');assert.deepEqual(s.activeTools,[]);
  const view=progressUpdate(2,s,'/run',null).content[0].text;
  assert.match(view,/timed out/);assert.match(view,/completed/);assert.match(view,/not proof of a stall/);
});
test('scientific progress comes only from explicit successful progress-tool results',()=>{
  const p=createProgress(0);
  p.observe({type:'message_update',assistantMessageEvent:{delta:'secret thinking'}},1);
  p.observe({type:'tool_execution_end',toolName:'read',result:{details:{phase:'wrong',verified:100}}},2);
  assert.equal(p.snapshot(3).verified,undefined);
  p.observe({type:'tool_execution_end',toolName:'literature_progress',result:{details:{phase:'verification',summary:'Checking primary sources',screened:20,verified:4}}},4);
  const view=progressUpdate(2,p.snapshot(5),'/run',null).content[0].text;
  assert.match(view,/reviewer-reported/);assert.match(view,/20 screened; 4 verified/);
  assert.doesNotMatch(view,/secret thinking|wrong/);
});
test('progress text strips terminal control characters and bounds self-reported prose',()=>{
  const p=createProgress(0);
  p.observe({type:'tool_execution_end',toolName:'literature_progress',result:{details:{phase:'\x1bphase',summary:'x'.repeat(10000),verified:-1}}},1);
  const s=p.snapshot(2);assert.equal(s.summary.length,180);assert(!s.phase.includes('\x1b'));assert.equal(s.verified,undefined);
});
