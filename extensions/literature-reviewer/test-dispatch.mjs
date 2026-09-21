import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Exercise the launcher's actual policy snippets without spawning Pi, loading
// credentials/MCP, or spending provider quota. Runner lifecycle has separate tests.
const source=fs.readFileSync(new URL('./index.ts',import.meta.url),'utf8');
function policy(depth) {
  const declarations=source.match(/const maxConcurrent=[^;]+;[\s\S]*?const maxDispatches=[^;]+;/)?.[0];
  const guards=source.match(/if\(active>=maxConcurrent\)[^\n]+\n\s*if\(dispatched>=maxDispatches\)[^\n]+/)?.[0];
  const reserve=source.match(/active\+\+;dispatched\+\+;/)?.[0];
  const release=source.match(/finally\s*\{\s*(active--;)/)?.[1];
  assert(declarations && guards && reserve && release,'launcher policy snippets must exist');
  return new Function('depth',`
    let active=0, dispatched=0;
    ${declarations}
    return {
      start() { ${guards} ${reserve} },
      finish() { ${release} },
      counts() { return {active,dispatched}; }
    };
  `)(depth);
}

test('main session accepts sequential follow-ups beyond four without a reload',()=>{
  const gate=policy(0);
  for(let i=0;i<12;i++) {
    gate.start();
    assert.deepEqual(gate.counts(),{active:1,dispatched:i+1});
    gate.finish();
  }
  assert.deepEqual(gate.counts(),{active:0,dispatched:12});
});

test('main concurrency stays at one and blocked attempts do not consume dispatches',()=>{
  const gate=policy(0);
  gate.start();
  assert.throws(()=>gate.start(),/At most 1 literature reviewers/);
  assert.deepEqual(gate.counts(),{active:1,dispatched:1});
  gate.finish();
  gate.start();
  assert.deepEqual(gate.counts(),{active:1,dispatched:2});
});

test('per-review allows four concurrent children and completion does not refund its four launches',()=>{
  const gate=policy(1);
  for(let i=0;i<4;i++) gate.start();
  assert.deepEqual(gate.counts(),{active:4,dispatched:4});
  assert.throws(()=>gate.start(),/At most 4 literature reviewers/);
  assert.deepEqual(gate.counts(),{active:4,dispatched:4});
  gate.finish(); // an active slot opens, but all four launches have been used
  assert.throws(()=>gate.start(),/Four-child dispatch budget reached for this review/);
  assert.deepEqual(gate.counts(),{active:3,dispatched:4});
  for(let i=0;i<3;i++) gate.finish();
  assert.deepEqual(gate.counts(),{active:0,dispatched:4});
  assert.throws(()=>gate.start(),/Four-child dispatch budget reached for this review/);
  assert.deepEqual(gate.counts(),{active:0,dispatched:4});
  const nextReview=policy(1);
  nextReview.start();
  assert.deepEqual(nextReview.counts(),{active:1,dispatched:1});
});

test('failed launched work releases concurrency but still counts against the child budget',()=>{
  for(const depth of [0,1]) {
    const gate=policy(depth);
    for(let i=0;i<4;i++) {
      assert.throws(()=>{
        gate.start();
        try { throw new Error('fixture failure'); }
        finally { gate.finish(); }
      },/fixture failure/);
    }
    assert.deepEqual(gate.counts(),{active:0,dispatched:4});
    if(depth===0) assert.doesNotThrow(()=>gate.start());
    else assert.throws(()=>gate.start(),/Four-child/);
  }
});
