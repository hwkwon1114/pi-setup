// Offline fixtures for lab registry caching, job summary, report claims, lost jobs, dependency wrappers and prompt sections. Run: node tests/test-lab.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, renameSync, rmSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
function piModules() {
  if (process.env.PI_HOST_MODULES) return process.env.PI_HOST_MODULES;
  const home = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent');
  const rel = join(home, 'install', 'releases');
  const versions = existsSync(rel) ? readdirSync(rel).filter(v => existsSync(join(rel, v, 'node_modules', '@earendil-works', 'pi-coding-agent')))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
  if (versions.length) return join(rel, versions.at(-1), 'node_modules');
  return execFileSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim();
}
const modules = piModules();
const { createJiti } = createRequire(join(modules, '@earendil-works/pi-coding-agent/package.json'))('jiti');
const jiti = createJiti(import.meta.url, { alias: {
  '@earendil-works/pi-coding-agent': join(modules, '@earendil-works/pi-coding-agent/dist/index.js'),
  '@earendil-works/pi-ai': join(modules, '@earendil-works/pi-ai/dist/index.js'),
  'typebox': join(modules, 'typebox/build/index.mjs') } });
const lab = await jiti.import(new URL('../index.ts', import.meta.url).pathname);

const root = mkdtempSync(join(tmpdir(), 'lab-test-')); const d = join(root, 'jobs');
const job = (id, status, extra = {}) => ({ id, name: `n-${id}`, card: 'SD-S3', cwd: '/', command: 'true', gpus: [1],
  log: join(d, id + '.log'), exitFile: join(d, id + '.exit'), started: `2026-11-01T00:00:0${id.length}Z`, status, ...extra });
const write = j => { const f = join(d, j.id + '.json'); writeFileSync(f + '.tmp', JSON.stringify(j)); renameSync(f + '.tmp', f); };
lab.readJobs(root); // creates jobs dir
write(job('a', 'running')); write(job('bb', 'queued')); write(job('ccc', 'queued', { gpus: [2] }));
let jobs = lab.readJobs(root);
assert.deepEqual(jobs.map(j => j.status), ['running', 'queued', 'queued']);
jobs[0].status = 'done'; // caller mutation must not leak into the cache
assert.equal(lab.readJobs(root)[0].status, 'running');
write({ ...job('bb', 'running') }); // atomic rewrite is picked up
assert.equal(lab.readJobs(root).find(j => j.id === 'bb').status, 'running');
rmSync(join(d, 'ccc.json')); assert.equal(lab.readJobs(root).length, 2);
writeFileSync(join(d, 'bad.json'), '{'); assert.equal(lab.readJobs(root).length, 2);

const s = lab.summarizeActive([job('a', 'running'), job('q1', 'queued'), job('q2', 'queued'), job('q3', 'queued', { gpus: [2] })]);
assert.match(s, /^a  running  gpu 1  SD-S3  n-a  started/);
assert.match(s, /\n3 queued: 2× SD-S3 on gpu 1, 1× SD-S3 on gpu 2 \(job_list for ids\)$/);
assert.equal(lab.summarizeActive([]), '(none)');
rmSync(root, { recursive: true, force: true });

// Report ownership: exactly one claim per finished job; a legacy `notified: true` counts as reported.
{
  const r = mkdtempSync(join(tmpdir(), 'lab-claim-')); const jd = join(r, 'jobs'); lab.readJobs(r);
  const fj = { id: 'f1', name: 'f', cwd: '/', command: 'true', gpus: [], log: join(jd, 'f1.log'), exitFile: join(jd, 'f1.exit'),
    started: '2026-11-01T00:00:00Z', status: 'done', session: 'S1' };
  writeFileSync(join(jd, 'f1.json'), JSON.stringify(fj));
  assert.equal(lab.claimReport(r, { ...fj }, 'S1'), true);
  writeFileSync(join(jd, 'f1.json'), JSON.stringify(fj)); // a concurrent rewrite dropped the flag
  assert.equal(lab.claimReport(r, { ...fj }, 'S2'), false, 'a second owner holding a stale copy must not report again');
  assert.equal(lab.readJobs(r)[0].notified, true, 'flag restored after a lost claim');
  assert.equal(readFileSync(join(jd, 'f1.notified'), 'utf8').trim(), 'S1');
  assert.equal(lab.readJobs(r)[0].notified, true);
  assert.equal(lab.claimReport(r, { ...fj, id: 'f2', notified: true }, 'S1'), false, 'legacy notified flag');
  rmSync(r, { recursive: true, force: true });
}

// Exits: a dead wrapper becomes `lost` (marker + sentinel 99, never an empty exit file); a real exit code wins; a stale
// concurrent view still reads `lost`; an exit file being written is retried; an older version's `lost` gets a backfilled sentinel.
const isLinux = existsSync('/proc/self/cmdline');
{
  const r = mkdtempSync(join(tmpdir(), 'lab-lost-')); const jd = join(r, 'jobs'); lab.readJobs(r);
  const dead = spawnSync(process.execPath, ['-e', '0']).pid;
  const mk = (id, extra = {}) => writeFileSync(join(jd, id + '.json'), JSON.stringify({ id, name: id, cwd: '/', command: 'x', gpus: [1],
    log: join(jd, id + '.log'), exitFile: join(jd, id + '.exit'), pid: dead, started: `2026-11-01T00:00:0${id.length}Z`, status: 'running', ...extra }));
  writeFileSync(join(jd, 'live.sh'), 'sleep 30\n'); const live = spawn('bash', [join(jd, 'live.sh')], { detached: true, stdio: 'ignore' }); live.unref();
  mk('lost'); mk('ok'); writeFileSync(join(jd, 'ok.exit'), '0\n'); mk('live', { pid: live.pid }); mk('queued', { status: 'queued' });
  mk('partial', { pid: live.pid }); writeFileSync(join(jd, 'partial.exit'), '');
  mk('old', { status: 'lost' });
  if (isLinux) mk('reused', { pid: process.pid }); // alive pid, but not running reused.sh
  const want = ['lost:lost', 'ok:done', 'queued:lost', ...(isLinux ? ['reused:lost'] : [])];
  assert.deepEqual(lab.refresh(r).map(j => `${j.id}:${j.status}`).sort(), want);
  for (const id of ['lost', 'queued', 'old']) {
    assert.equal(readFileSync(join(jd, id + '.exit'), 'utf8'), `${lab.EXIT.lost}\n`, `${id} sentinel`);
    assert.ok(existsSync(join(jd, id + '.lost')), `${id} marker`);
  }
  assert.equal(lab.readJobs(r).find(j => j.id === 'live').status, 'running');
  assert.equal(lab.readJobs(r).find(j => j.id === 'partial').status, 'running', 'empty exit file is not exit 0');
  writeFileSync(join(jd, 'partial.exit'), '97\n');
  mk('lost'); // a concurrent session's stale view (still running) must not turn the sentinel into failed/99
  assert.deepEqual(lab.refresh(r).map(j => `${j.id}:${j.status}:${j.exit}`).sort(), ['lost:lost:undefined', 'partial:failed:97']);
  assert.deepEqual(lab.refresh(r), [], 'terminal states are final');
  assert.deepEqual(readdirSync(jd).filter(f => f.endsWith('.tmp')), [], 'no temp files left');
  process.kill(-live.pid, 'SIGTERM');
  rmSync(r, { recursive: true, force: true });
}

// Dependency wrappers: success chains; failure stops (97); a killed predecessor releases waiting and later dependents (98);
// a reused pid is not the predecessor; Linux needs no `ps`; an OLD exit-file-only wrapper is released by refresh's sentinel.
if (process.platform !== 'win32') {
  const D = mkdtempSync(join(tmpdir(), 'lab wrap $HOME `x` \'q\' ')); const b = id => join(D, id); // hostile path: quoting
  const mk = (id, cmd, after) => { writeFileSync(b(id) + '.cmd.sh', `#!/bin/bash\n${cmd}\n`); writeFileSync(b(id) + '.sh', lab.wrapperScript(b(id), D, after, 1)); };
  const run = (id, env) => { const c = spawn('bash', [b(id) + '.sh'], { detached: true, stdio: 'ignore', env: env ?? process.env }); c.unref(); return c.pid; };
  const exitOf = async (id, ms = 15000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(100)) if (existsSync(b(id) + '.exit')) return readFileSync(b(id) + '.exit', 'utf8').trim(); return 'TIMEOUT'; };
  const dep = (id, pid) => ({ id, base: b(id), pid });
  mk('a', 'sleep 1; pwd > pwd.txt; exit 0'); const pa = run('a'); mk('a2', 'exit 0', dep('a', pa)); run('a2');
  mk('c', 'exit 3'); const pc = run('c'); mk('c2', 'exit 0', dep('c', pc)); run('c2');
  mk('e', 'sleep 60'); const pe = run('e'); mk('e2', 'exit 0', dep('e', pe)); run('e2');
  mk('x', 'exit 0', dep('nonexistent', 2 ** 22 + 7)); run('x');
  mk('reuse', 'exit 0', dep('e', process.pid)); run('reuse');
  let noPs;
  if (isLinux) { // PATH without ps: liveness comes from /proc
    const bin = join(D, 'bin'); mkdirSync(bin);
    for (const t of ['bash', 'tr', 'grep', 'sleep', 'cat', 'mv', 'touch']) symlinkSync(execFileSync('bash', ['-c', `command -v ${t}`], { encoding: 'utf8' }).trim(), join(bin, t));
    mk('slow', 'sleep 4; exit 0'); const ps = run('slow'); mk('nops', 'exit 0', dep('slow', ps)); noPs = run('nops', { PATH: bin });
  }
  // OLD wrapper (pre-fix): waits only for the exit file; a lab job whose wrapper we kill must release it via refresh.
  const r = mkdtempSync(join(tmpdir(), 'lab-old-')); const jd = join(r, 'jobs'); lab.readJobs(r);
  writeFileSync(join(jd, 'p.sh'), 'sleep 60\n'); const pp = spawn('bash', [join(jd, 'p.sh')], { detached: true, stdio: 'ignore' }); pp.unref();
  writeFileSync(join(jd, 'p.json'), JSON.stringify({ id: 'p', name: 'p', cwd: '/', command: 'x', gpus: [1], log: join(jd, 'p.log'), exitFile: join(jd, 'p.exit'), pid: pp.pid, started: '2026-11-01T00:00:00Z', status: 'running' }));
  writeFileSync(join(jd, 'o.sh'), `#!/bin/bash\nwhile [ ! -f "${jd}/p.exit" ]; do sleep 1; done\n[ "$(cat "${jd}/p.exit")" = 0 ] || { echo "dependency p failed"; echo 97 > "${jd}/o.exit"; exit 0; }\ntouch "${jd}/o.started"\n`);
  spawn('bash', [join(jd, 'o.sh')], { detached: true, stdio: 'ignore' }).unref();
  await sleep(2500);
  assert.equal(existsSync(b('e2') + '.exit'), false, 'a dependent must keep waiting while its predecessor runs');
  if (isLinux) assert.equal(existsSync(b('nops') + '.exit'), false, 'missing ps must not read as a dead predecessor');
  process.kill(-pe, 'SIGTERM'); process.kill(-pp.pid, 'SIGTERM');
  assert.equal(await exitOf('a'), '0'); assert.equal(await exitOf('a2'), '0'); assert.equal(readFileSync(join(D, 'pwd.txt'), 'utf8').trim(), D);
  assert.equal(await exitOf('c'), '3'); assert.equal(await exitOf('c2'), String(lab.EXIT.depFailed));
  assert.equal(await exitOf('e2'), String(lab.EXIT.depVanished)); assert.equal(existsSync(b('e') + '.exit'), false);
  mk('e3', 'exit 0', dep('e', pe)); run('e3'); assert.equal(await exitOf('e3'), String(lab.EXIT.depVanished));
  assert.equal(await exitOf('x'), String(lab.EXIT.depVanished)); assert.equal(await exitOf('reuse'), String(lab.EXIT.depVanished));
  if (isLinux) assert.equal(await exitOf('nops'), '0');
  for (const id of ['a2', 'c2', 'e2', 'e3', 'x', 'reuse']) assert.equal(existsSync(b(id) + '.started'), id === 'a2', `${id} .started`);
  for (let t0 = Date.now(); Date.now() - t0 < 5000 && lab.readJobs(r)[0].status === 'running'; await sleep(200)) lab.refresh(r);
  assert.equal(lab.readJobs(r)[0].status, 'lost');
  for (let t0 = Date.now(); Date.now() - t0 < 5000 && !existsSync(join(jd, 'o.exit')); ) await sleep(100);
  assert.equal(readFileSync(join(jd, 'o.exit'), 'utf8').trim(), '97', 'old wrapper released'); assert.equal(existsSync(join(jd, 'o.started')), false);
  rmSync(D, { recursive: true, force: true }); rmSync(r, { recursive: true, force: true });
}

// GPU choice: a dependent takes over its running/queued predecessor's GPU unless another active job already waits on it there.
{
  const J = (id, status, gpus, after) => ({ id, status, gpus, after });
  const jobs = [J('A', 'running', [1]), J('B', 'queued', [1], 'A'), J('D', 'done', [2]), J('C', 'running', [2])];
  assert.deepEqual(lab.pickGpus([1, 2, 3], jobs, new Set([1, 2]), jobs[1]).free, [1, 3], 'after B: takes over GPU 1');
  assert.deepEqual(lab.pickGpus([1, 2, 3], jobs, new Set([1, 2]), jobs[0]).free, [3], 'fan-out after A: not GPU 1 again');
  assert.deepEqual(lab.pickGpus([1, 2, 3], jobs, new Set([1, 2]), jobs[2]).free, [3], 'finished D hands over nothing (C uses GPU 2)');
  assert.deepEqual(lab.pickGpus([1, 2, 3], jobs, new Set([3])).free, [], 'all reserved or busy');
}

// Extension behaviour with a fake Pi: report ownership across sessions, batching, startup display-only, busy follow-up,
// card binding (case-insensitive), legacy flags, prompt sections, job_start/kill guards.
{
  const P = mkdtempSync(join(tmpdir(), 'lab-ext-')); writeFileSync(join(P, 'RESEARCH_STATE.md'), '# Dash\n');
  mkdirSync(join(P, '.pi')); writeFileSync(join(P, '.pi', 'lab.json'), JSON.stringify({ allowed_gpus: [1], max_gpus_per_job: 1 }));
  const R = join(P, '.pi', 'lab'); const jd = join(R, 'jobs'); lab.readJobs(R);
  const dead = spawnSync(process.execPath, ['-e', '0']).pid;
  const J = (id, session, card, status = 'running', extra = {}) => writeFileSync(join(jd, id + '.json'), JSON.stringify({ id, name: 'n-' + id,
    card, cwd: P, command: 'x', gpus: [], log: join(jd, id + '.log'), exitFile: join(jd, id + '.exit'), pid: dead, session,
    started: `2026-11-01T00:00:${String(J.n = (J.n ?? 0) + 1).padStart(2, '0')}Z`, status, ...extra }));
  const done = (id, code = 0) => writeFileSync(join(jd, id + '.exit'), `${code}\n`);
  const jobOf = id => JSON.parse(readFileSync(join(jd, id + '.json'), 'utf8'));
  const realSI = globalThis.setInterval, realCI = globalThis.clearInterval;
  const session = (sid, card) => {
    const h = {}, tools = {}, cmds = {}, sent = [], notes = [], tick = [];
    const pi = { on: (e, f) => (h[e] ??= []).push(f), registerTool: t => { tools[t.name] = t; }, registerCommand: (n, c) => { cmds[n] = c; },
      sendMessage: (m, o) => sent.push({ m, o }), appendEntry: () => {} };
    globalThis.setInterval = f => { tick.push(f); return tick.length; }; globalThis.clearInterval = () => {};
    lab.default(pi);
    const s = { idle: true, h, tools, cmds, sent, notes, tick };
    s.ctx = { cwd: P, hasUI: true, isIdle: () => s.idle, sessionManager: { getSessionId: () => sid,
      getBranch: () => card ? [{ type: 'custom', customType: 'lab-card', data: { card } }] : [] },
      ui: { setStatus: () => {}, notify: m => notes.push(m), confirm: async () => true } };
    return s;
  };
  const start = async s => { for (const f of s.h.session_start) await f({}, s.ctx); };
  try {
    J('j1', 'OWNER', 'SD-S3'); done('j1');
    J('j2', 'STARTER', 'SD-S3', 'done', { notified: false, exit: 0 });           // legacy: seen first by an old non-owner
    J('j0', 'OWNER', 'SD-S3', 'done', { notified: true, exit: 0 });              // legacy: already reported
    const other = session('OTHER'); await start(other);
    assert.equal(other.sent.length, 0, 'non-owner never reports'); assert.ok(other.notes.some(n => n.includes('j1')), 'non-owner notice');
    assert.equal(jobOf('j1').status, 'done'); assert.equal(jobOf('j1').notified, undefined); assert.equal(existsSync(join(jd, 'j1.notified')), false);
    const owner = session('OWNER'); await start(owner);
    assert.equal(owner.sent.length, 1); assert.equal(owner.sent[0].o, undefined, 'startup report is display-only');
    assert.match(owner.sent[0].m.content, /Job j1 /); assert.doesNotMatch(owner.sent[0].m.content, /Job j[02] /);
    J('j3', 'OWNER', 'X'); J('j4', 'OWNER', 'X'); done('j3', 1); done('j4');
    owner.tick[0]();
    assert.equal(owner.sent.length, 2, 'two jobs, one wake-up'); assert.deepEqual(owner.sent[1].o, { triggerTurn: true });
    assert.match(owner.sent[1].m.content, /Job j3 .*FAILED exit=1/); assert.match(owner.sent[1].m.content, /Job j4 .*DONE exit=0/);
    J('j5', 'OWNER', 'X'); done('j5'); owner.idle = false; owner.tick[0]();
    assert.deepEqual(owner.sent[2].o, { deliverAs: 'followUp', triggerTurn: true }, 'busy: follow-up');
    owner.tick[0](); assert.equal(owner.sent.length, 3, 'reported once');
    const card = session('CARDSESSION', 'sd-s3'); await start(card);
    assert.equal(card.sent.length, 1); assert.match(card.sent[0].m.content, /Job j2 /); assert.doesNotMatch(card.sent[0].m.content, /Job j[01345] /);
    // Prompt sections, and their removal outside a project.
    const ev = { systemPromptOptions: { sections: {} } };
    await owner.h.before_agent_start[0](ev, owner.ctx); assert.deepEqual(Object.keys(ev.systemPromptOptions.sections), ['lab_state', 'lab_jobs']);
    const bare = mkdtempSync(join(tmpdir(), 'lab-bare-'));
    let anc = false; for (let x = bare; dirname(x) !== x; x = dirname(x)) anc ||= existsSync(join(dirname(x), 'RESEARCH_STATE.md'));
    if (!anc) { await owner.h.before_agent_start[0](ev, { ...owner.ctx, cwd: bare }); assert.deepEqual(ev.systemPromptOptions.sections, {}); }
    rmSync(bare, { recursive: true, force: true });
    // job_start refuses a predecessor that can never exit 0 (before spawning anything).
    await assert.rejects(owner.tools.job_start.execute('t', { name: 'z', command: 'true', after: 'j3' }, undefined, undefined, owner.ctx), /already failed/);
    // /jobs kill: refuses finished jobs; kills a running one, records it lost and releases its dependent.
    await owner.cmds.jobs.handler('kill j1', owner.ctx); assert.match(owner.notes.at(-1), /already done/);
    if (process.platform !== 'win32') { // finishes while the dialog is open: re-checked after confirm, never signalled
      const fb = join(jd, 'f'); writeFileSync(fb + '.sh', 'sleep 30\n');
      const fp = spawn('bash', [fb + '.sh'], { detached: true, stdio: 'ignore' }); fp.unref(); J('f', 'OWNER', 'X', 'running', { pid: fp.pid });
      const confirm = owner.ctx.ui.confirm; owner.ctx.ui.confirm = async () => { done('f'); return true; };
      await owner.cmds.jobs.handler('kill f', owner.ctx); owner.ctx.ui.confirm = confirm;
      assert.match(owner.notes.at(-1), /^f is done; nothing to kill/); assert.doesNotThrow(() => process.kill(fp.pid, 0), 'not signalled');
      process.kill(-fp.pid, 'SIGTERM'); owner.tick[0](); // consume f's report so later counts are unaffected
    }
    if (process.platform !== 'win32') {
      const kb = join(jd, 'k'); writeFileSync(kb + '.cmd.sh', 'sleep 60\n'); writeFileSync(kb + '.sh', lab.wrapperScript(kb, P));
      const kp = spawn('bash', [kb + '.sh'], { detached: true, stdio: 'ignore' }); kp.unref();
      J('k', 'OWNER', 'X', 'running', { pid: kp.pid });
      const k2 = join(jd, 'k2'); writeFileSync(k2 + '.cmd.sh', 'exit 0\n'); writeFileSync(k2 + '.sh', lab.wrapperScript(k2, P, { id: 'k', base: kb, pid: kp.pid }, 1));
      const k2p = spawn('bash', [k2 + '.sh'], { detached: true, stdio: 'ignore' }); k2p.unref();
      J('k2', 'OWNER', 'X', 'queued', { pid: k2p.pid, after: 'k' });
      await sleep(300);
      await owner.cmds.jobs.handler('kill k', owner.ctx);
      assert.equal(jobOf('k').status, 'lost'); assert.match(owner.notes.at(-1), /^k: lost/);
      for (let t0 = Date.now(); Date.now() - t0 < 8000 && !existsSync(k2 + '.exit'); ) await sleep(100);
      assert.ok(['97', '98'].includes(readFileSync(k2 + '.exit', 'utf8').trim()), 'dependent released'); assert.equal(existsSync(k2 + '.started'), false);
    }
    for (const s of [other, owner, card]) for (const f of s.h.session_shutdown) await f({}, s.ctx);
  } finally { globalThis.setInterval = realSI; globalThis.clearInterval = realCI; rmSync(P, { recursive: true, force: true }); }
}

// Prompt sections: dashboard/card in lab_state, jobs only in lab_jobs.
{
  const proj = mkdtempSync(join(tmpdir(), 'lab-proj-'));
  writeFileSync(join(proj, 'RESEARCH_STATE.md'), '# Dashboard\nDASH-LINE\n');
  mkdirSync(join(proj, '.pi')); writeFileSync(join(proj, '.pi', 'lab.json'), JSON.stringify({ allowed_gpus: [1], max_gpus_per_job: 1 }));
  const r = join(proj, '.pi', 'lab'); lab.readJobs(r); writeFileSync(join(r, 'jobs', 'a.json'), JSON.stringify(job('a', 'running')));
  const sec = lab.stateSections(proj);
  assert.deepEqual(Object.keys(sec), ['lab_state', 'lab_jobs']);
  assert.match(sec.lab_state, /DASH-LINE/); assert.match(sec.lab_state, /Active card: none bound/); assert.ok(!sec.lab_state.includes('n-a'));
  assert.match(sec.lab_jobs, /^Lab jobs running\/queued:\na  running  gpu 1  SD-S3  n-a  started/);
  const bare = mkdtempSync(join(tmpdir(), 'lab-noproj-'));
  let anc = false; for (let x = bare; dirname(x) !== x; x = dirname(x)) anc ||= existsSync(join(dirname(x), 'RESEARCH_STATE.md'));
  if (!anc) assert.equal(lab.stateSections(bare), undefined);
  rmSync(proj, { recursive: true, force: true }); rmSync(bare, { recursive: true, force: true });
}

// Optional read-only check against a real registry (LAB_REGISTRY=<dir containing jobs/>): cached read equals a naive parse.
const real = process.env.LAB_REGISTRY;
if (!real || !existsSync(join(real, 'jobs'))) { console.log('PASS (fixture only; set LAB_REGISTRY to also check a real registry)'); process.exit(0); }
const naive = readdirSync(join(real, 'jobs')).filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(readFileSync(join(real, 'jobs', f), 'utf8'))).sort((a, b) => a.started.localeCompare(b.started));
let t = performance.now(); const first = lab.readJobs(real); const t1 = performance.now() - t;
t = performance.now(); const second = lab.readJobs(real); const t2 = performance.now() - t;
assert.deepEqual(first, naive); assert.deepEqual(second, naive);
const act = naive.filter(j => j.status === 'running' || j.status === 'queued');
const oldText = act.map(j => `${j.id}  ${j.status}  gpu ${j.gpus.join(',')}  ${j.card}  ${j.name}  started ${j.started.slice(0, 16)}Z`).join('\n');
console.log(`PASS. real registry: ${naive.length} jobs; cold ${t1.toFixed(1)} ms, cached ${t2.toFixed(1)} ms; ` +
  `job block ${oldText.length} -> ${lab.summarizeActive(act).length} chars`);
