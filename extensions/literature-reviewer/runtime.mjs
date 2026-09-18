import fs from 'node:fs';
import path from 'node:path';

export const REVIEW_TIMEOUT_MS = 900000;
export const CHILD_TIMEOUT_MS = 600000;
export const MIN_CHILD_MS = 60000;

function timestamp(value, name) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`Invalid ${name}`);
  return n;
}

export function budgetFrom(env) {
  const hard = env.PI_LITERATURE_DEADLINE_MS;
  const soft = env.PI_LITERATURE_FINALIZE_MS;
  if (hard === 'none' && soft === 'none') return { deadlineAt: null, finalizeAt: null };
  if (hard === undefined && soft === undefined) return undefined;
  const deadlineAt = timestamp(hard, 'review deadline');
  const finalizeAt = timestamp(soft, 'review finalization deadline');
  if (finalizeAt > deadlineAt) throw new Error('Finalization deadline exceeds hard deadline');
  return { deadlineAt, finalizeAt };
}

export function planBudget({ depth, now = Date.now(), parentBudget }) {
  timestamp(now, 'dispatch time');
  if (depth !== 1 && depth !== 2) throw new Error('Invalid dispatch depth');
  if (depth === 1) return { startedAt: now, deadlineAt: null, finalizeAt: null, timeoutMs: null };
  if (!parentBudget) throw new Error('Parent deadline unavailable; do not dispatch a child');
  const unbounded = parentBudget.deadlineAt === null && parentBudget.finalizeAt === null;
  if (!unbounded) {
    timestamp(parentBudget.finalizeAt, 'parent finalization deadline');
    timestamp(parentBudget.deadlineAt, 'parent hard deadline');
    if (parentBudget.finalizeAt > parentBudget.deadlineAt) throw new Error('Invalid parent budget');
  }
  const deadlineAt = Math.min(now + CHILD_TIMEOUT_MS, unbounded ? Infinity : parentBudget.finalizeAt);
  const timeoutMs = deadlineAt - now;
  if (depth === 2 && timeoutMs < MIN_CHILD_MS)
    throw new Error('Insufficient child budget before parent finalization; synthesize existing evidence');
  const reserve = Math.min(60000, Math.floor(timeoutMs / 3));
  return { startedAt: now, deadlineAt, finalizeAt: deadlineAt - reserve, timeoutMs };
}

export function budgetNotice(budget, now = Date.now()) {
  if (budget.deadlineAt === null) return '[Literature-review runtime: coordinator has no wall-clock deadline. Keep the assigned scope bounded, publish literature_progress at phase changes, save report/handoff checkpoints, and integrate partial child results. Each leaf has its own 10-minute deadline. Finish when essential evidence and synthesis are sufficient; do not search indefinitely.]';
  const remaining = Math.max(0, Math.ceil((budget.deadlineAt - now) / 1000));
  const phase = now >= budget.finalizeAt
    ? 'FINALIZE NOW: no new retrieval or child dispatch. Save the concise evidence-backed report, actual route ledger and handoff.json; then return a brief final answer. Mark incomplete coverage partial.'
    : 'Keep scope narrow; save substantive findings and actual route status incrementally. Leave the finalization interval for synthesis and checks.';
  return `[Literature-review runtime: ${remaining}s remaining; retrieval cutoff ${new Date(budget.finalizeAt).toISOString()}; hard deadline ${new Date(budget.deadlineAt).toISOString()}. ${phase}]`;
}

// No timer or synthetic follow-up turn: one ephemeral notice before each model call.
// Cannot interrupt a model request already in flight; the outer runner still enforces the hard deadline.
export function registerBudgetHooks(pi, budget, clock = Date.now) {
  if (!budget) return;
  pi.on('context', (event) => ({ messages: [
    ...event.messages.filter(m => !(m.role === 'custom' && m.customType === 'literature-budget')),
    { role: 'custom', customType: 'literature-budget', content: budgetNotice(budget, clock()), display: false, timestamp: clock() },
  ] }));
  pi.on('tool_call', (event) => {
    if (budget.finalizeAt !== null && clock() >= budget.finalizeAt && ['mcp', 'literature_review'].includes(event.toolName))
      return { block: true, reason: budgetNotice(budget, clock()) };
  });
}

const MAX_MANIFEST_BYTES = 65536;
const MAX_ARTIFACTS = 128;
const isWithin = (root, file) => file === root || file.startsWith(root + path.sep);

export function readBoundedText(file, maxBytes = 45000) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error('Not a regular file');
    const buffer = Buffer.alloc(Math.min(stat.size, maxBytes));
    const n = fs.readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.subarray(0, n).toString('utf8') + (stat.size > maxBytes ? '\n[Preview truncated; original file preserved.]' : '');
  } finally { fs.closeSync(fd); }
}

// Validate declared paths, not arbitrary prose or shell output. External project artifacts
// are listed only; their contents are never auto-read. This is not a filesystem sandbox.
export function collectArtifacts({ runDir, cwd, allowProjectArtifacts = false, hasFinalResponse = false }) {
  const roots = [fs.realpathSync(runDir)];
  if (allowProjectArtifacts) roots.push(fs.realpathSync(cwd));
  const artifacts = [], errors = [];
  let declaredStatus = null, declaredReport = null;
  const inspect = (raw, source) => {
    if (typeof raw !== 'string' || !raw.trim() || raw.length > 4096 || raw.includes('\0')) {
      errors.push('Invalid artifact path'); return null;
    }
    const file = path.resolve(runDir, raw);
    const item = { path: file, source, status: 'available' };
    try {
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('not a regular non-symlink file');
      if (!roots.some(root => isWithin(root, fs.realpathSync(file)))) throw new Error('outside allowed artifact roots');
      item.bytes = stat.size;
    } catch (e) {
      item.status = e.code === 'ENOENT' ? 'missing' : 'rejected';
      item.reason = e.code === 'ENOENT' ? 'file does not exist' : e.message;
      errors.push(`${item.status}: ${file} (${item.reason})`);
    }
    artifacts.push(item);
    return item.status === 'available' ? file : null;
  };
  // lstat detects broken symlinks too, unlike existsSync.
  const exists = file => { try { fs.lstatSync(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
  const reportPath = path.join(runDir, 'report.md');
  const localReport = exists(reportPath) ? inspect(reportPath, 'authored-report') : null;
  const handoffPath = path.join(runDir, 'handoff.json');
  if (exists(handoffPath) && inspect(handoffPath, 'handoff')) {
    try {
      if (fs.statSync(handoffPath).size > MAX_MANIFEST_BYTES) throw new Error('manifest exceeds 64 KiB');
      const h = JSON.parse(readBoundedText(handoffPath, MAX_MANIFEST_BYTES));
      if (h?.version !== 1 || !['partial', 'blocked', 'complete_within_scope'].includes(h.status) ||
          !Array.isArray(h.artifacts) || h.artifacts.length > MAX_ARTIFACTS ||
          (h.report !== undefined && typeof h.report !== 'string')) throw new Error('invalid handoff schema');
      declaredStatus = h.status;
      if (h.report !== undefined) declaredReport = inspect(h.report, 'declared-report');
      for (const file of h.artifacts) inspect(file, 'declared-artifact');
    } catch (e) { errors.push(`Invalid handoff.json: ${e.message}`); }
  }
  const finalResponse = hasFinalResponse ? inspect('final-response.md', 'final-response') : null;
  return { artifacts, errors, declaredStatus, report: localReport || declaredReport || finalResponse, localReport };
}

export function formatFailure(result) {
  const available = result.artifacts.filter(a => a.status === 'available').slice(0, 12).map(a => `- ${a.path}`).join('\n');
  return `Literature reviewer incomplete: ${result.error || 'Child did not finish successfully'}\n` +
    `Elapsed ${Math.round(result.elapsedMs / 1000)}s / ${result.budgetMs === null ? 'no wall-clock deadline' : `${Math.round(result.budgetMs / 1000)}s budget`}; last model stop reason: ${result.stopReason || 'none'}.\n` +
    `Saved drafts are partial regardless of any completion wording they contain.\n` +
    `Primary report: ${result.report || '(none)'}\nArtifact inventory: ${result.artifactManifest}\nRun/logs: ${result.runDir}\n` +
    (available ? `Available artifacts:\n${available}\n` : '') +
    (result.text ? `\nPartial authored report / completed response preview:\n${result.text.slice(0, 6000)}` : '');
}
