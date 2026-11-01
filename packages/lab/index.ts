/**
 * lab — research job runner for Pi.
 *
 * - `job_start` tool: launches a detached shell job (survives Pi restarts), assigns GPUs under the nearest `.pi/lab.json`
 *   policy (allowed GPUs, max per job; a GPU is free only if no compute process runs on it and no lab job reserves it), records provenance
 *   (command, sha256 of declared input files, git HEAD/dirty state of the cwd repo), optional `after` dependency.
 * - Wakes the session that started a job, or a session bound to the job's card, when the job exits (sendMessage triggerTurn),
 *   with exit code, duration, log tail and the job's `on_done` instruction; jobs that finish together share one wake-up.
 *   Any session may record an exit, but only an owning session reports it, claimed by exclusively creating <id>.notified
 *   (so concurrent owners report once). Other sessions get a transient UI notice and never consume the report. A session
 *   that starts or resumes reports its own jobs that finished meanwhile (display only, no automatic turn).
 * - `after` runs a job only if its predecessor exits 0 (else exit 97). A wrapper that dies without an exit code (killed,
 *   OOM, reboot) is marked `lost` (<id>.lost) and given sentinel exit code 99; a waiting dependent also stops (exit 98) when
 *   the predecessor's wrapper process is gone. So killing a job releases its queue instead of leaving dependents reserved
 *   forever. A dependent takes over its predecessor's GPU only if no other active job already waits on it there.
 * - `job_list` tool and `/jobs` command; footer status "lab: N running".
 * - Guard: blocks bash commands that set CUDA_VISIBLE_DEVICES to a GPU outside the policy.
 *
 * - State block: before every agent run, injects two system-prompt sections re-read from files: `lab_state` (the nearest
 *   RESEARCH_STATE.md dashboard and the session's active card path + Status/Stage lines) and `lab_jobs` (running/queued
 *   jobs). Pi re-sends only a changed section, so a job transition costs a short `lab_jobs` delta, not the dashboard.
 *   Files stay authoritative; this only keeps them in view when the conversation is compressed.
 * - `/card <ID>`: starts a fresh session bound to card <ID> (custom entry `lab-card`) and pre-fills a kickoff prompt;
 *   `/card <ID> here` binds the current session; `/card` lists cards. Jobs tagged with the active card wake that session
 *   even if another session started them.
 * - `/lab-init [dir]`: creates the research-project scaffold (`scaffold/`: AGENTS.md, RESEARCH_STATE.md, DECISIONS.md +
 *   DECISIONS_LOG.md, ACTIVE.md, cards/ template and verifier/critic prompts, anti-drift checklist, .ignore, .gitignore)
 *   and `.pi/lab.json` with a GPU policy from nvidia-smi. Never overwrites an existing file.
 *
 * Registry: <dir of lab.json>/lab/jobs/<id>.{json,sh,log,exit}. No lab.json -> CPU-only jobs (gpus must be 0).
 *
 * Slurm backend (Quest): when `sbatch` is on PATH (or lab.json sets "backend": "slurm"), job_start submits with
 *   sbatch and the scheduler is the source of truth (squeue while live, sacct after; see slurm.ts). Jobs survive Pi
 *   restarts and login-node changes; the originating session is woken once on completion/failure. Defaults come from
 *   lab.json `slurm` {account, partition, time, cpus, mem, conda_env, extra}, then built-in Quest defaults.
 *   Local jobs record their host; a local PID is only declared lost when checked on that same host.
 */
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as os from "node:os";
import * as slurm from "./slurm.ts";

interface Policy {
	allowed_gpus: number[]; max_gpus_per_job: number; notes?: string;
	/** Optional: cap on distinct GPUs held by active lab jobs at once (any of allowed_gpus). */
	max_total_gpus?: number;
	/** Optional: a GPU used only by other users' processes is usable when it has at least this much free memory (MiB);
	 *  unset = any foreign compute process makes the GPU busy (previous behaviour). */
	share_foreign_min_free_mib?: number;
	backend?: "local" | "slurm"; slurm?: slurm.SlurmDefaults;
}
interface Job {
	id: string; name: string; card?: string; cwd: string; command: string; gpus: number[]; after?: string; on_done?: string;
	log: string; exitFile: string; pid?: number; session?: string; started: string; ended?: string;
	status: "queued" | "running" | "done" | "failed" | "lost"; exit?: number; inputs?: Record<string, string>;
	git?: { head?: string; dirty?: string[] }; notified?: boolean;
	backend?: "local" | "slurm"; host?: string; slurm_id?: string; slurm_detail?: string; missing_since?: string;
}
const FINISHED = new Set<Job["status"]>(["done", "failed", "lost"]);
/** Exit codes written by the lab itself: predecessor failed, predecessor vanished, wrapper lost. */
export const EXIT = { depFailed: 97, depVanished: 98, lost: 99 } as const;

const QUEST_DEFAULTS: slurm.SlurmDefaults = {
	account: process.env.SRUN_ACCOUNT ?? "p33082", partition: "short", time: "00:30:00", cpus: 1, mem: "4G",
};
const hasSbatch = (() => { let v: boolean | undefined; return () => {
	if (v === undefined) { try { execFileSync("which", ["sbatch"], { stdio: "ignore", timeout: 5000 }); v = true; } catch { v = false; } }
	return v;
}; })();

function findPolicy(cwd: string): { policy?: Policy; root: string } {
	for (let d = path.resolve(cwd); ; d = path.dirname(d)) {
		const f = path.join(d, ".pi", "lab.json");
		if (fs.existsSync(f)) return { policy: JSON.parse(fs.readFileSync(f, "utf8")), root: path.join(d, ".pi", "lab") };
		if (path.dirname(d) === d) return { root: path.join(process.env.HOME ?? "/tmp", ".pi", "lab") };
	}
}
const jobsDir = (root: string) => { const d = path.join(root, "jobs"); fs.mkdirSync(d, { recursive: true }); return d; };
/** Parsed job files keyed by path; re-parsed only when the file's inode/mtime/size changes (writeJob renames). */
const jobCache = new Map<string, { key: string; job: Job }>();
export function readJobs(root: string): Job[] {
	const d = jobsDir(root);
	const seen = new Set<string>();
	const jobs: Job[] = [];
	for (const f of fs.readdirSync(d)) {
		if (!f.endsWith(".json")) continue;
		const file = path.join(d, f);
		seen.add(file);
		try {
			const st = fs.statSync(file);
			const key = `${st.ino}:${st.mtimeMs}:${st.size}`;
			let hit = jobCache.get(file);
			if (!hit || hit.key !== key) { hit = { key, job: JSON.parse(fs.readFileSync(file, "utf8")) as Job }; jobCache.set(file, hit); }
			jobs.push(structuredClone(hit.job)); // callers mutate jobs; keep the cache pristine
		} catch { jobCache.delete(file); }
	}
	for (const file of jobCache.keys()) if (file.startsWith(d + path.sep) && !seen.has(file)) jobCache.delete(file);
	return jobs.sort((a, b) => a.started.localeCompare(b.started));
}
function writeJob(root: string, j: Job) {
	// Unique temp name: several Pi processes may rewrite one job concurrently; each rename is atomic and the last one wins.
	const f = path.join(jobsDir(root), `${j.id}.json`), tmp = `${f}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(j, null, 1)); fs.renameSync(tmp, f);
}
const alive = (pid?: number) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } };
/** The job's wrapper (`bash <base>.sh`) still runs. Uses the command line where /proc exists, so a reused pid or zombie is not alive. */
function wrapperAlive(j: Job): boolean {
	if (!alive(j.pid)) return false;
	let cmd: string;
	try { cmd = fs.readFileSync(`/proc/${j.pid}/cmdline`, "utf8"); } catch { return true; } // no /proc (macOS): trust kill(0)
	return cmd.includes(j.exitFile.replace(/\.exit$/, ".sh"));
}
const sha = (f: string) => createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const dur = (a: string, b?: string) => { const s = Math.round(((b ? Date.parse(b) : Date.now()) - Date.parse(a)) / 1000); return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`; };
const tail = (f: string, n = 15) => { try { return fs.readFileSync(f, "utf8").split("\n").slice(-n - 1).join("\n").slice(-3000); } catch { return "(no log)"; } };

/** GPUs with any running compute process (memory alone is unreliable: JAX jobs may hold <1 GB). */
function gpuBusy(): Set<number> {
	const q = (a: string) => execFileSync("nvidia-smi", [a, "--format=csv,noheader"], { encoding: "utf8", timeout: 20000 }).trim().split("\n").filter(Boolean).map((l) => l.split(",").map((x) => x.trim()));
	const idx = new Map(q("--query-gpu=index,uuid").map(([i, u]) => [u, Number(i)]));
	return new Set(q("--query-compute-apps=gpu_uuid,pid").map(([u]) => idx.get(u)).filter((g): g is number => g !== undefined));
}

/** Free memory (MiB) per GPU index. */
function gpuFreeMiB(): Map<number, number> {
	const out = execFileSync("nvidia-smi", ["--query-gpu=index,memory.free", "--format=csv,noheader,nounits"], { encoding: "utf8", timeout: 20000 });
	return new Map(out.trim().split("\n").filter(Boolean).map((l) => { const [i, f] = l.split(",").map((x) => Number(x.trim())); return [i, f] as [number, number]; }));
}

let lastSlurmQuery = 0;
/** Refresh job states from exit files / wrapper processes (local) or the scheduler (slurm). Returns jobs that newly finished. */
export function refresh(root: string, force = true): Job[] {
	const fin: Job[] = [];
	const jobs = readJobs(root);
	const sj = jobs.filter((j) => (j.status === "running" || j.status === "queued") && j.backend === "slurm" && j.slurm_id);
	if (sj.length && (force || Date.now() - lastSlurmQuery > 60000)) {
		lastSlurmQuery = Date.now();
		let res: Map<string, slurm.SlurmStatus | undefined> | undefined;
		try { res = slurm.query(sj.map((j) => j.slurm_id!)); } catch { res = undefined; } // scheduler unreachable: leave state
		for (const j of res ? sj : []) {
			const s = res!.get(j.slurm_id!);
			if (!s) {
				if (!j.missing_since) { j.missing_since = new Date().toISOString(); writeJob(root, j); }
				else if (Date.now() - Date.parse(j.missing_since) > slurm.MISSING_GRACE_MS) {
					j.status = "lost"; j.ended = new Date().toISOString(); j.slurm_detail = "absent from squeue and sacct";
					writeJob(root, j); fin.push(j);
				}
				continue;
			}
			const changed = s.state !== j.status || s.detail !== j.slurm_detail || j.missing_since;
			j.missing_since = undefined; j.slurm_detail = s.detail;
			if (s.state === "done" || s.state === "failed") {
				j.status = s.state; j.exit = s.exit; j.ended = s.ended ?? new Date().toISOString();
				writeJob(root, j); fin.push(j);
			} else if (changed) { j.status = s.state as Job["status"]; writeJob(root, j); }
		}
	}
	for (const j of jobs) {
		if (j.backend === "slurm") continue;
		if (j.status === "lost") {
			// Recorded lost without a sentinel (by an older lab version): backfill it so `after` dependents stop waiting.
			if (!fs.existsSync(j.exitFile) && !wrapperAlive(j)) markLost(j);
			continue;
		}
		if (j.status !== "running" && j.status !== "queued") continue;
		// Wrapper gone and still no exit file after the liveness check: it can no longer write one, so the job is lost.
		// Local jobs record their host; a local PID is only declared lost when checked on that same host.
		if ((!j.host || j.host === os.hostname()) && !fs.existsSync(j.exitFile) && !wrapperAlive(j) && !fs.existsSync(j.exitFile)) markLost(j);
		if (fs.existsSync(j.exitFile)) {
			const raw = fs.readFileSync(j.exitFile, "utf8").trim();
			if (!/^-?\d+$/.test(raw)) continue; // still being written (old wrappers write `echo 97 > exit`): next poll
			const lostMark = j.exitFile.replace(/\.exit$/, ".lost");
			if (fs.existsSync(lostMark)) { j.status = "lost"; j.exit = undefined; j.ended = new Date(fs.statSync(lostMark).mtimeMs).toISOString(); }
			else { const code = Number(raw); j.exit = code; j.status = code === 0 ? "done" : "failed"; j.ended = new Date(fs.statSync(j.exitFile).mtimeMs).toISOString(); }
			writeJob(root, j); fin.push(j);
		} else if (j.status === "queued" && fs.existsSync(j.log.replace(/\.log$/, ".started"))) { j.status = "running"; writeJob(root, j); }
	}
	return fin;
}

/**
 * Record a job whose wrapper died without an exit code: <base>.lost marks it (written first, so any reader of the sentinel
 * also sees the marker), then the sentinel exit code is created atomically with its content (hard link of a complete temp
 * file; never an empty file another session could read as 0). An existing exit file is kept.
 */
function markLost(j: Job) {
	const base = j.exitFile.replace(/\.exit$/, "");
	fs.writeFileSync(base + ".lost", new Date().toISOString() + "\n");
	const tmp = `${base}.exit.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
	fs.writeFileSync(tmp, `${EXIT.lost}\n`);
	try { fs.linkSync(tmp, j.exitFile); }
	catch (e) {
		// No hard links on this filesystem: exclusive create (non-atomic content, tolerated by the readers' digit check).
		if ((e as { code?: string }).code !== "EEXIST") { try { fs.writeFileSync(j.exitFile, `${EXIT.lost}\n`, { flag: "wx" }); } catch { /* exists */ } }
	} finally { fs.rmSync(tmp, { force: true }); }
}

/**
 * Claim the report of a finished job by exclusively creating <id>.notified, so that when several sessions own a job (its
 * starter and sessions bound to its card) exactly one reports it. Older records use `notified: true` for "already reported".
 */
export function claimReport(root: string, j: Job, by: string): boolean {
	if (j.notified === true) return false;
	let won = true;
	try { fs.writeFileSync(path.join(jobsDir(root), `${j.id}.notified`), `${by}\n`, { flag: "wx" }); } catch { won = false; }
	// Record the flag either way (a concurrent rewrite may have dropped it), so later polls skip the job without a claim attempt.
	j.notified = true;
	try { writeJob(root, j); } catch { /* the claim file is authoritative */ }
	return won;
}

/** Single-quote for bash: no expansion of `$`, backticks or backslashes. */
const sq = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;

/**
 * Detached wrapper for a job: optionally waits for its `after` predecessor, then runs <base>.cmd.sh and records the exit code
 * atomically in <base>.exit. While waiting it gives up with 98 if the predecessor's wrapper process is gone without an exit
 * code (pid and command line, so a reused pid or a zombie does not count), and with 97 if the predecessor exited non-zero.
 */
export function wrapperScript(base: string, cwd: string, after?: { id: string; base: string; pid?: number }, pollSeconds = 30): string {
	const finish = (code: string) => `echo ${code} > ${sq(base + ".exit.tmp")}; mv ${sq(base + ".exit.tmp")} ${sq(base + ".exit")}`;
	const stop = (code: number, msg: string) => `{ echo ${sq(msg)}; ${finish(String(code))}; exit 0; }`;
	let wait = "";
	if (after) {
		const pexit = sq(after.base + ".exit");
		// Predecessor alive = its pid still runs `bash <pred>.sh`: /proc where present (no `ps` needed), else ps, else kill -0.
		const liveFn = after.pid
			? "lab_alive() { if [ -d /proc/self ]; then [ -r \"/proc/$1/cmdline\" ] && tr '\\0' ' ' < \"/proc/$1/cmdline\" | grep -qF -- \"$2\"; " +
				"elif command -v ps >/dev/null 2>&1; then ps -ww -p \"$1\" -o args= 2>/dev/null | grep -qF -- \"$2\"; else kill -0 \"$1\" 2>/dev/null; fi; }\n"
			: "";
		const gone = after.pid
			? `  lab_alive ${after.pid} ${sq(after.base + ".sh")} || [ -f ${pexit} ] || ` +
				stop(EXIT.depVanished, `dependency ${after.id} ended without an exit code (killed or lost)`) + "\n"
			: "";
		wait = `${liveFn}while [ ! -f ${pexit} ]; do\n${gone}  sleep ${pollSeconds}\ndone\n` +
			`[ "$(cat ${pexit})" = 0 ] || ${stop(EXIT.depFailed, `dependency ${after.id} failed`)}\n`;
	}
	return `#!/bin/bash\n${wait}touch ${sq(base + ".started")}\ncd ${sq(cwd)}\nbash ${sq(base + ".cmd.sh")}\n${finish("$?")}\n`;
}

/**
 * GPUs a new job may use: allowed, not reserved by an active lab job, no compute process. A job queued `after` a running or
 * queued predecessor may take over the predecessor's GPU, unless another active job already waits on that predecessor there
 * (otherwise both would start together on one GPU). A finished predecessor hands nothing over.
 */
export function pickGpus(allowed: number[], jobs: Job[], busy: Set<number>, pred?: Job,
	opts: { maxTotal?: number; shareForeign?: boolean; freeMiB?: Map<number, number>; minFreeMiB?: number } = {}): { free: number[]; reserved: number[] } {
	const active = jobs.filter((j) => j.status === "running" || j.status === "queued");
	const reserved = new Set(active.flatMap((j) => j.gpus));
	const handover = new Set(pred && (pred.status === "running" || pred.status === "queued") ? pred.gpus : []);
	for (const j of active) if (pred && j.after === pred.id) for (const g of j.gpus) handover.delete(g);
	// Foreign-only GPUs (a process but no lab job of ours) are usable when sharing is enabled and enough memory is free.
	const shareOk = (g: number) => !!opts.shareForeign && (opts.freeMiB?.get(g) ?? 0) >= (opts.minFreeMiB ?? 0);
	let free = allowed.filter((g) => handover.has(g) || (!reserved.has(g) && (!busy.has(g) || shareOk(g))));
	if (opts.maxTotal !== undefined) {
		const room = Math.max(0, opts.maxTotal - reserved.size);
		const fresh = free.filter((g) => !handover.has(g));
		// prefer GPUs with no foreign process, then more free memory, then lower index last for GPU 0 (shared by other users)
		fresh.sort((a, b) => Number(busy.has(a)) - Number(busy.has(b)) || (opts.freeMiB?.get(b) ?? 0) - (opts.freeMiB?.get(a) ?? 0) || Number(a === 0) - Number(b === 0));
		free = [...free.filter((g) => handover.has(g)), ...fresh.slice(0, room)];
	}
	return { free, reserved: [...reserved] };
}

/** Project root = nearest ancestor containing RESEARCH_STATE.md. */
function findProject(cwd: string): string | undefined {
	for (let d = path.resolve(cwd); ; d = path.dirname(d)) {
		if (fs.existsSync(path.join(d, "RESEARCH_STATE.md"))) return d;
		if (path.dirname(d) === d) return undefined;
	}
}
function listCards(proj: string): string[] {
	const d = path.join(proj, "cards");
	return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith(".md") && f !== "TEMPLATE.md" && f !== "README.md" && !f.endsWith("_PROMPT.md")).sort() : [];
}

/** Scaffold shipped with this package (generic copies of the card-workflow project files). */
export const SCAFFOLD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "scaffold");

/** Default GPU policy for a new project: every detected GPU, one per job, all but one at once when there are several. */
export function defaultPolicy(gpuCount: number): Policy & { notes: string } {
	const all = Array.from({ length: gpuCount }, (_, i) => i);
	return {
		allowed_gpus: all, max_gpus_per_job: 1,
		...(gpuCount > 1 ? { max_total_gpus: gpuCount - 1 } : {}),
		...(gpuCount ? { share_foreign_min_free_mib: 3000 } : {}),
		notes: gpuCount
			? `Initial /lab-init default: ${gpuCount} GPU(s) detected; one job per GPU${gpuCount > 1 ? `, at most ${gpuCount - 1} at once (leave one for other users)` : ""}; a GPU used by other users only with >=3000 MiB free. Review and record changes in DECISIONS_LOG.md.`
			: "Initial /lab-init default: no GPUs detected; CPU-only jobs. Edit allowed_gpus to enable GPU jobs.",
	};
}

/**
 * Copy the project scaffold into `target`, filling {{PROJECT}}, {{ROOT}} and {{DATE}}, and write `.pi/lab.json`.
 * Existing files are never overwritten (reported as skipped).
 */
export function scaffoldProject(target: string, opts: { project?: string; date?: string; gpuCount?: number; from?: string } = {}):
	{ created: string[]; skipped: string[] } {
	const root = path.resolve(target), from = opts.from ?? SCAFFOLD_DIR;
	const vars: Record<string, string> = { PROJECT: opts.project ?? path.basename(root), ROOT: root, DATE: opts.date ?? new Date().toISOString().slice(0, 10) };
	const fill = (t: string) => t.replace(/\{\{(PROJECT|ROOT|DATE)\}\}/g, (_, k: string) => vars[k]);
	const created: string[] = [], skipped: string[] = [];
	const put = (rel: string, text: string) => {
		const dst = path.join(root, rel);
		if (fs.existsSync(dst)) { skipped.push(rel); return; }
		fs.mkdirSync(path.dirname(dst), { recursive: true });
		fs.writeFileSync(dst, text, { flag: "wx" }); created.push(rel);
	};
	const walk = (rel: string) => {
		for (const e of fs.readdirSync(path.join(from, rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
			const r = path.join(rel, e.name);
			if (e.isDirectory()) walk(r); else put(r, fill(fs.readFileSync(path.join(from, r), "utf8")));
		}
	};
	walk("");
	put(path.join(".pi", "lab.json"), JSON.stringify(defaultPolicy(opts.gpuCount ?? 0), null, 1) + "\n");
	return { created, skipped };
}

function gpuCount(): number {
	try {
		return execFileSync("nvidia-smi", ["--query-gpu=index", "--format=csv,noheader"], { encoding: "utf8", timeout: 20000 }).trim().split("\n").filter(Boolean).length;
	} catch { return 0; }
}
function findCard(proj: string, id: string): string | undefined {
	const k = id.toLowerCase();
	const f = listCards(proj).find((c) => c.toLowerCase() === `${k}.md` || c.toLowerCase().startsWith(`${k}_`));
	return f ? path.join("cards", f) : undefined;
}
/** First `Status:` and `Stage:` lines of a card (each truncated). */
function cardHeader(file: string): string {
	try {
		const ls = fs.readFileSync(file, "utf8").split("\n");
		return ["Status:", "Stage:"].map((p) => ls.find((l) => l.startsWith(p))).filter((l): l is string => !!l)
			.map((l) => (l.length > 400 ? l.slice(0, 399) + "\u2026" : l)).join("\n");
	} catch { return "(card unreadable)"; }
}

/**
 * Running jobs one per line; queued jobs as counts per card and GPU (a long queue would otherwise
 * dominate the per-turn prompt). Stable text (no durations), so the section changes only when jobs do.
 */
export function summarizeActive(act: Job[]): string {
	if (!act.length) return "(none)";
	const g = (j: Job) => (j.backend === "slurm" ? `slurm ${j.slurm_id}` : j.gpus.length ? `gpu ${j.gpus.join(",")}` : "cpu");
	const run = act.filter((j) => j.status === "running")
		.map((j) => `${j.id}  running  ${g(j)}  ${j.card ?? "-"}  ${j.name}  started ${j.started.slice(0, 16)}Z`);
	const queued = act.filter((j) => j.status === "queued");
	if (queued.length) {
		const groups = new Map<string, number>();
		for (const j of queued) { const k = `${j.card ?? "-"} on ${g(j)}`; groups.set(k, (groups.get(k) ?? 0) + 1); }
		run.push(`${queued.length} queued: ${[...groups].map(([k, n]) => `${n}× ${k}`).join(", ")} (job_list for ids)`);
	}
	return run.join("\n");
}

/**
 * Per-turn prompt sections: `lab_state` (instructions, active card, dashboard; changes rarely) and `lab_jobs` (running and
 * queued jobs; changes with every job transition). Separate sections keep the prompt delta of a job transition short.
 */
export function stateSections(cwd: string, activeCard?: string): { lab_state: string; lab_jobs: string } | undefined {
	const proj = findProject(cwd);
	if (!proj) return undefined;
	let dash = "";
	try { dash = fs.readFileSync(path.join(proj, "RESEARCH_STATE.md"), "utf8").trim(); } catch { return undefined; }
	if (dash.length > 6000) dash = dash.slice(0, 6000) + "\n\u2026 (truncated; read RESEARCH_STATE.md)";
	const cf = activeCard ? findCard(proj, activeCard) : undefined;
	const card = activeCard
		? (cf ? `Active card (this session): ${activeCard} \u2014 ${path.join(proj, cf)}\n${cardHeader(path.join(proj, cf))}` : `Active card: ${activeCard} (card file not found)`)
		: "Active card: none bound (use /card <ID>); infer from the dashboard and ask if unclear.";
	let jobs: string;
	try {
		const { root } = findPolicy(cwd);
		// Stable text (no durations), so the section changes only when jobs do.
		jobs = summarizeActive(readJobs(root).filter((j) => j.status === "running" || j.status === "queued"));
	} catch { jobs = "(registry unreadable)"; }
	return {
		lab_state: [
			"Re-read from files before this turn. Files are authoritative over conversation memory and compressed summaries.",
			"Record anything needed later (commands, job IDs, decisions, numbers) in the card or DECISIONS.md, not only in chat.",
			"", card, "", `--- ${path.join(proj, "RESEARCH_STATE.md")} ---`, dash,
		].join("\n"),
		lab_jobs: `Lab jobs running/queued:\n${jobs}`,
	};
}

function line(j: Job) {
	const g = j.backend === "slurm" ? `slurm ${j.slurm_id}` : j.gpus.length ? `gpu ${j.gpus.join(",")}` : "cpu";
	const e = j.exit !== undefined ? ` exit=${j.exit}` : "";
	return `${j.id}  ${j.status.padEnd(7)} ${dur(j.started, j.ended).padStart(7)}  ${g.padEnd(9)} ${j.card ?? "-"}  ${j.name}${e}`;
}

export default function (pi: ExtensionAPI) {
	let timer: ReturnType<typeof setInterval> | undefined;
	let sessionId = "";
	let activeCard: string | undefined;

	const report = (j: Job) =>
		`[lab] Job ${j.id} "${j.name}"${j.card ? ` (card ${j.card})` : ""} ${j.status.toUpperCase()}` +
		`${j.exit !== undefined ? ` exit=${j.exit}` : ""} after ${dur(j.started, j.ended)}. Log: ${j.log}\n` +
		(j.backend === "slurm" ? `Slurm ${j.slurm_id}: ${j.slurm_detail ?? ""}\n` : "") +
		"```\n" + tail(j.log) + "\n```\n" +
		(j.on_done ? `Planned next step (from job_start on_done): ${j.on_done}\n` : "");
	const verify = "Verify outputs before reporting; a zero exit code is not evidence the results are correct.";
	/** Jobs this session reports: those it started and those tagged with its bound card. */
	const mine = (j: Job) => (!!sessionId && j.session === sessionId) || (!!activeCard && j.card?.toLowerCase() === activeCard.toLowerCase());

	/**
	 * Record exits (any session may), then report this session's finished jobs that no owner has reported yet, whichever
	 * session observed the exit; jobs that finish together share one message. At startup the report is display-only.
	 * Other sessions' jobs only get a transient UI notice; their owners report them.
	 */
	const poll = (ctx: ExtensionContext, startup = false) => {
		try {
			const { root } = findPolicy(ctx.cwd);
			const fin = refresh(root, false);
			const jobs = readJobs(root);
			const own = jobs.filter((j) => FINISHED.has(j.status) && !j.notified && mine(j) && claimReport(root, j, sessionId));
			if (own.length) {
				const msg = { customType: "lab-job", content: own.map(report).join("\n") + verify, display: true };
				if (startup) pi.sendMessage(msg);
				else pi.sendMessage(msg, ctx.isIdle() ? { triggerTurn: true } : { deliverAs: "followUp", triggerTurn: true });
			}
			if (ctx.hasUI) {
				for (const j of fin) if (!mine(j)) ctx.ui.notify(`lab: job ${j.id} ${j.status} (${j.name})`, j.status === "done" ? "info" : "warning");
				const act = jobs.filter((j) => j.status === "running" || j.status === "queued");
				ctx.ui.setStatus("lab", act.length ? `lab: ${act.filter((j) => j.status === "running").length} running, ${act.filter((j) => j.status === "queued").length} queued` : undefined);
			}
		} catch { /* registry unreadable: retry at the next poll */ }
	};

	pi.on("session_start", async (_e, ctx) => {
		sessionId = ctx.sessionManager.getSessionId();
		activeCard = undefined;
		try {
			for (const e of ctx.sessionManager.getBranch() as Array<{ type: string; customType?: string; data?: { card?: string } }>)
				if (e.type === "custom" && e.customType === "lab-card") activeCard = e.data?.card;
		} catch { /* no branch */ }
		if (ctx.hasUI) ctx.ui.setStatus("lab-card", activeCard ? `card: ${activeCard}` : undefined);
		// Report this session's jobs that finished while it was not running (display only), then poll every 30 s.
		poll(ctx, true);
		if (timer) clearInterval(timer);
		timer = setInterval(() => poll(ctx), 30000);
	});
	pi.on("session_shutdown", async () => { if (timer) clearInterval(timer); timer = undefined; });

	// Per-turn state (system-prompt sections; Pi appends a transcript delta only for a section that changed).
	pi.on("before_agent_start", async (event, ctx) => {
		const sections = event.systemPromptOptions.sections;
		const s = stateSections(ctx.cwd, activeCard);
		if (s) Object.assign(sections, s);
		else { delete sections.lab_state; delete sections.lab_jobs; }
	});

	pi.registerCommand("card", {
		description: "`/card <ID>`: fresh session bound to a card; `/card <ID> here`: bind this session; `/card`: list cards",
		getArgumentCompletions: (prefix) => {
			const proj = findProject(process.cwd());
			if (!proj) return null;
			return listCards(proj).map((f) => f.split("_")[0].replace(/\.md$/, "")).filter((id) => id.toLowerCase().startsWith(prefix.toLowerCase()))
				.map((id) => ({ value: id, label: id }));
		},
		handler: async (args, ctx) => {
			const proj = findProject(ctx.cwd);
			if (!proj) return ctx.ui.notify("No RESEARCH_STATE.md above cwd; /card needs a project.", "warning");
			const [id, mode] = (args ?? "").trim().split(/\s+/).filter(Boolean);
			if (!id) return ctx.ui.notify(`Active: ${activeCard ?? "none"}\nCards:\n${listCards(proj).join("\n") || "(none)"}`, "info");
			const cf = findCard(proj, id);
			if (!cf) return ctx.ui.notify(`No card matching ${id} in ${path.join(proj, "cards")}`, "warning");
			const cardId = path.basename(cf, ".md").split("_")[0];
			const kickoff = `Card ${cardId}: read RESEARCH_STATE.md, DECISIONS.md and ${cf} (its Stage line and \u00a78 run record), ` +
				"then continue from the card's current stage. Stay within the card's question and edit boundary.";
			if (mode === "here") {
				pi.appendEntry("lab-card", { card: cardId }); activeCard = cardId;
				ctx.ui.setStatus("lab-card", `card: ${cardId}`);
				return ctx.ui.notify(`This session is bound to ${cardId}.`, "info");
			}
			await ctx.waitForIdle();
			const r = await ctx.newSession({
				parentSession: ctx.sessionManager.getSessionFile?.() ?? undefined,
				setup: async (sm) => { sm.appendCustomEntry("lab-card", { card: cardId }); sm.appendSessionInfo(`card ${cardId}`); },
				withSession: async (c) => { c.ui.setEditorText(kickoff); c.ui.notify(`New session bound to ${cardId}. Edit/send the kickoff prompt.`, "info"); },
			});
			if (r.cancelled) ctx.ui.notify("New session cancelled.", "warning");
		},
	});

	// Guard raw bash launches that pin a disallowed GPU.
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return;
		const cmd = String((event.input as { command?: string }).command ?? "");
		const m = [...cmd.matchAll(/CUDA_VISIBLE_DEVICES\s*=\s*["']?([0-9,\s]*)/g)];
		if (!m.length) return;
		const { policy } = findPolicy(ctx.cwd);
		if (!policy?.allowed_gpus) return;
		for (const x of m) {
			const ids = x[1].split(",").map((s) => s.trim()).filter(Boolean).map(Number);
			const bad = ids.filter((g) => !policy.allowed_gpus.includes(g));
			if (bad.length) return { block: true, reason: `lab policy: GPU ${bad.join(",")} not allowed (allowed ${policy.allowed_gpus.join(",")}). Use job_start for GPU jobs.` };
		}
	});

	pi.registerTool(defineTool({
		name: "job_start",
		label: "Start job",
		description:
			"Launch a long-running command (training, sweeps, simulations) as a detached, tracked job. Prefer this over nohup/& or raw sbatch in bash. " +
			"On Slurm clusters (sbatch on PATH, e.g. Quest) the default backend submits with sbatch; the scheduler (squeue/sacct) is the source of truth, so jobs survive Pi restarts. " +
			"Give `command` (wrapped in a generated batch script; resources from `slurm`, lab.json `slurm` defaults, else Quest defaults short/00:30:00/1 cpu/4G) " +
			"or `script` (an existing sbatch script whose #SBATCH lines apply; `slurm` fields given here override them). " +
			"Local backend: GPUs are assigned under the project lab policy (CUDA_VISIBLE_DEVICES is set for you — do not set it in the command). " +
			"Records sha256 of `inputs` (code/config files) and git state. When the job exits, this session is woken with exit code, log tail and `on_done`. " +
			"Use `after` to queue behind another job of the same backend (runs only if that job exits 0).",
		parameters: Type.Object({
			name: Type.String({ description: "Short job name" }),
			command: Type.Optional(Type.String({ description: "Shell command (bash). Write outputs to the declared output directory. Required unless `script` is given." })),
			script: Type.Optional(Type.String({ description: "Slurm only: path to an existing sbatch script to submit instead of `command`" })),
			script_args: Type.Optional(Type.Array(Type.String(), { description: "Arguments passed to `script`" })),
			backend: Type.Optional(Type.Union([Type.Literal("slurm"), Type.Literal("local")], { description: "Default: lab.json backend, else slurm if sbatch exists, else local" })),
			slurm: Type.Optional(Type.Object({
				account: Type.Optional(Type.String()), partition: Type.Optional(Type.String()),
				time: Type.Optional(Type.String({ description: "Walltime, e.g. 04:00:00" })), cpus: Type.Optional(Type.Number()),
				mem: Type.Optional(Type.String({ description: "e.g. 16G" })), array: Type.Optional(Type.String({ description: "--array spec, e.g. 0-9%4" })),
				conda_env: Type.Optional(Type.String({ description: "Conda env activated before `command`" })),
				extra: Type.Optional(Type.Array(Type.String(), { description: "Extra sbatch options" })),
			}, { description: "Slurm resources; fields override lab.json slurm defaults" })),
			cwd: Type.Optional(Type.String({ description: "Working directory (default: session cwd)" })),
			gpus: Type.Optional(Type.Number({ description: "Number of GPUs (default 0 = CPU)" })),
			card: Type.Optional(Type.String({ description: "Card ID this job belongs to, e.g. SD-P2" })),
			after: Type.Optional(Type.String({ description: "Job id to wait for (must exit 0)" })),
			inputs: Type.Optional(Type.Array(Type.String(), { description: "Code/config files to hash for provenance" })),
			on_done: Type.Optional(Type.String({ description: "What the orchestrator should do when this job finishes" })),
		}),
		async execute(_id, p, _signal, _onUpdate, ctx) {
			const cwd = path.resolve(ctx.cwd, p.cwd ?? ".");
			const { policy, root } = findPolicy(cwd);
			const n = p.gpus ?? 0; let gpus: number[] = [];
			const backend = p.backend ?? policy?.backend ?? (hasSbatch() ? "slurm" : "local");
			if (!p.command === !p.script) throw new Error("Give exactly one of `command` or `script`.");
			if (p.script && backend !== "slurm") throw new Error("`script` requires the slurm backend.");
			refresh(root);
			const jobs = readJobs(root);
			const pred = p.after ? jobs.find((j) => j.id === p.after) : undefined;
			if (p.after && !pred) throw new Error(`after: unknown job ${p.after}`);
			if (pred && (pred.status === "failed" || pred.status === "lost")) throw new Error(`after: job ${pred.id} is already ${pred.status}; it cannot exit 0`);
			if (pred && (pred.backend ?? "local") !== backend) throw new Error(`after: job ${p.after} uses the ${pred.backend ?? "local"} backend; dependencies must use the same backend.`);
			const id = `${new Date().toISOString().slice(5, 16).replace(/[-:T]/g, "")}-${Math.random().toString(36).slice(2, 6)}`;
			const d = jobsDir(root), base = path.join(d, id);
			const inputs: Record<string, string> = {};
			for (const f of p.inputs ?? []) { const a = path.resolve(cwd, f); inputs[f] = fs.existsSync(a) ? sha(a) : "MISSING"; }
			let git: Job["git"];
			try {
				git = { head: execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim(),
					dirty: execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" }).split("\n").filter(Boolean).slice(0, 200) };
			} catch { git = undefined; }

			if (backend === "slurm") {
				// Script mode keeps the script's own #SBATCH lines; only explicit `slurm` fields override them.
				const req: slurm.SlurmRequest = p.script ? { ...(p.slurm ?? {}) } : { ...QUEST_DEFAULTS, ...(policy?.slurm ?? {}), ...(p.slurm ?? {}) };
				if (n > 0) req.gpus = n;
				if (pred) {
					if (pred.status === "failed" || pred.status === "lost") throw new Error(`after: job ${pred.id} already ${pred.status}.`);
					if (pred.status !== "done") req.dependency = `afterok:${pred.slurm_id}`;
				}
				let script: string, log: string | undefined;
				if (p.command) {
					script = base + ".cmd.sh";
					fs.writeFileSync(script, slurm.wrapCommand(p.command, req.conda_env));
					log = req.array ? `${base}_%a.log` : `${base}.log`;
				} else {
					script = path.resolve(cwd, p.script!);
					if (!fs.existsSync(script)) throw new Error(`script not found: ${script}`);
					inputs[p.script!] = sha(script);
				}
				const args = slurm.sbatchArgs(req, p.name, cwd, log);
				const sid = slurm.submit(args, script, cwd, p.script_args ?? []);
				log ??= slurm.stdoutPath(sid) ?? "(see the script's #SBATCH --output)";
				const job: Job = { id, name: p.name, card: p.card, cwd, gpus: [], after: p.after, on_done: p.on_done,
					command: p.command ?? ["sbatch", ...args, script, ...(p.script_args ?? [])].join(" "),
					log, exitFile: base + ".exit", session: sessionId, started: new Date().toISOString(),
					status: "queued", inputs, git, backend: "slurm", slurm_id: sid, host: os.hostname() };
				writeJob(root, job);
				return {
					content: [{ type: "text", text: `Submitted job ${id} as Slurm ${sid} (${["sbatch", ...args].join(" ")}).\nLog: ${log}\nYou will be woken when it finishes; do not poll.` }],
					details: job,
				};
			}

			const command = p.command!;
			if (/(export\s+)?CUDA_VISIBLE_DEVICES\s*=/.test(command)) throw new Error("Do not set CUDA_VISIBLE_DEVICES in the command; request gpus instead.");
			if (n > 0) {
				if (!policy) throw new Error("No .pi/lab.json GPU policy found above cwd; GPU jobs refused.");
				if (n > policy.max_gpus_per_job) throw new Error(`Requested ${n} GPUs > max_gpus_per_job ${policy.max_gpus_per_job}`);
				const busy = gpuBusy();
				const share = policy.share_foreign_min_free_mib !== undefined;
				const { free, reserved } = pickGpus(policy.allowed_gpus, jobs, busy, pred, {
					maxTotal: policy.max_total_gpus, shareForeign: share, minFreeMiB: policy.share_foreign_min_free_mib, freeMiB: share || policy.max_total_gpus !== undefined ? gpuFreeMiB() : undefined });
				if (free.length < n) throw new Error(`Not enough free GPUs: need ${n}, free ${free.join(",") || "none"} (reserved by lab jobs: ${reserved.join(",") || "none"}; GPUs with compute processes: ${[...busy].join(",") || "none"}).`);
				gpus = free.slice(0, n);
			}
			fs.writeFileSync(base + ".cmd.sh", `#!/bin/bash\n${command}\n`);
			fs.writeFileSync(base + ".sh", wrapperScript(base, cwd, pred && { id: pred.id, base: path.join(d, pred.id), pid: pred.pid }));
			const log = fs.openSync(base + ".log", "a");
			const env = { ...process.env, CUDA_VISIBLE_DEVICES: gpus.length ? gpus.join(",") : "" };
			const child = spawn("bash", [base + ".sh"], { cwd, detached: true, stdio: ["ignore", log, log], env });
			child.unref(); fs.closeSync(log);
			const job: Job = { id, name: p.name, card: p.card, cwd, command, gpus, after: p.after, on_done: p.on_done,
				log: base + ".log", exitFile: base + ".exit", pid: child.pid, session: sessionId, started: new Date().toISOString(),
				status: p.after ? "queued" : "running", inputs, git, backend: "local", host: os.hostname() };
			writeJob(root, job);
			return {
				content: [{ type: "text", text: `Started job ${id} (${job.status}) pid ${child.pid}, ${gpus.length ? `CUDA_VISIBLE_DEVICES=${gpus.join(",")}` : "CPU only"}.\nLog: ${job.log}\nYou will be woken when it exits; do not poll.` }],
				details: job,
			};
		},
	}));

	pi.registerTool(defineTool({
		name: "job_list",
		label: "List jobs",
		description: "List lab jobs (status, runtime, GPUs or Slurm id, card). Use instead of ps/nvidia-smi/squeue polling.",
		parameters: Type.Object({ all: Type.Optional(Type.Boolean({ description: "Include finished jobs (default: last 20)" })) }),
		async execute(_id, p, _s, _u, ctx) {
			const { root, policy } = findPolicy(ctx.cwd); refresh(root);
			const jobs = readJobs(root); const shown = p.all ? jobs : jobs.slice(-20);
			const txt = (policy?.allowed_gpus ? `policy: GPUs ${policy.allowed_gpus.join(",")}, ≤${policy.max_gpus_per_job}/job\n` : "no GPU policy\n") +
				(shown.map(line).join("\n") || "(no jobs)");
			return { content: [{ type: "text", text: txt }], details: undefined };
		},
	}));

	pi.registerCommand("lab-init", {
		description: "`/lab-init [dir]`: create the research-project scaffold (cards, dashboard, decisions, prompts, .pi/lab.json); never overwrites",
		handler: async (args, ctx) => {
			const target = path.resolve(ctx.cwd, (args ?? "").trim() || ".");
			const above = findProject(path.dirname(target));
			if (above && !(await ctx.ui.confirm("Nested project?", `${above} already has RESEARCH_STATE.md. Create a separate project in ${target}?`))) return;
			const { created, skipped } = scaffoldProject(target, { gpuCount: gpuCount() });
			ctx.ui.notify(`lab-init in ${target}\nCreated (${created.length}): ${created.join(", ") || "none"}` +
				(skipped.length ? `\nKept existing (${skipped.length}): ${skipped.join(", ")}` : "") +
				"\nNext: write the objective in AGENTS.md, review .pi/lab.json, then draft the first card from cards/TEMPLATE.md.", "info");
		},
	});

	pi.registerCommand("jobs", {
		description: "Show lab jobs; `/jobs log <id>` shows a log tail; `/jobs kill <id>` stops a job",
		handler: async (args, ctx) => {
			const { root } = findPolicy(ctx.cwd); refresh(root);
			const [cmd, id] = (args ?? "").trim().split(/\s+/);
			const j = id ? readJobs(root).find((x) => x.id === id) : undefined;
			if (cmd === "log" && j) return ctx.ui.notify(tail(j.log, 30), "info");
			if (cmd === "kill" && j?.backend === "slurm" && j.slurm_id) {
				if (await ctx.ui.confirm("Cancel Slurm job?", `${j.id} ${j.name} (slurm ${j.slurm_id})`)) {
					try { slurm.cancel(j.slurm_id); } catch (e) { ctx.ui.notify(`scancel failed: ${(e as Error).message}`, "warning"); }
				}
				return;
			}
			if (cmd === "kill" && j?.pid) {
				// A finished job's pid may have been reused; never signal it.
				if (j.status !== "running" && j.status !== "queued") return ctx.ui.notify(`${j.id} is already ${j.status}.`, "info");
				if (!(await ctx.ui.confirm("Kill job?", `${j.id} ${j.name}`))) return;
				// Re-check after the dialog: the job may have finished meanwhile and its pid been reused.
				refresh(root);
				const cur = readJobs(root).find((x) => x.id === j.id);
				if (!cur?.pid || (cur.status !== "running" && cur.status !== "queued") || !wrapperAlive(cur))
					return ctx.ui.notify(`${j.id} is ${cur?.status ?? "gone"}; nothing to kill.`, "info");
				try { process.kill(-cur.pid, "SIGTERM"); } catch { /* gone */ }
				// Record it now: a killed wrapper leaves no exit code; refresh marks it lost and writes the sentinel that releases dependents.
				await new Promise((r) => setTimeout(r, 1500)); refresh(root);
				const k = readJobs(root).find((x) => x.id === j.id);
				const deps = readJobs(root).filter((x) => x.after === j.id && x.status === "queued").length;
				return ctx.ui.notify(`${j.id}: ${k?.status ?? "unknown"}${deps ? `; ${deps} queued dependent(s) will stop without running` : ""}`, "info");
			}
			ctx.ui.notify(readJobs(root).slice(-20).map(line).join("\n") || "(no jobs)", "info");
		},
	});
}
