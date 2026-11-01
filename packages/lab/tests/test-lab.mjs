// Offline fixture for lab registry caching and the lab_state job summary. Run: node tests/test-lab.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, renameSync, rmSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
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
