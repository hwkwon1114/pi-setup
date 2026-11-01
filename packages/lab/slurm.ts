/**
 * Slurm backend for the lab job runner (Quest). Pure parsing helpers plus thin
 * wrappers around sbatch/squeue/sacct/scancel/scontrol. No Pi imports, so it can
 * be tested standalone.
 *
 * State source of truth is the scheduler: squeue while a job is live, sacct after.
 * A job missing from both is kept in its last state for MISSING_GRACE_MS (sacct
 * records can lag), then reported "lost".
 */
import { execFileSync } from "node:child_process";

export interface SlurmDefaults {
	account?: string; partition?: string; time?: string; cpus?: number; mem?: string;
	conda_env?: string; extra?: string[];
}
export interface SlurmRequest extends SlurmDefaults { gpus?: number; dependency?: string; array?: string }
export type LabState = "queued" | "running" | "done" | "failed" | "lost";
export interface SlurmStatus { state: LabState; exit?: number; detail: string; ended?: string }

export const MISSING_GRACE_MS = 15 * 60 * 1000;
const TIMEOUT = 20000;

const run = (cmd: string, args: string[], cwd?: string) =>
	execFileSync(cmd, args, { encoding: "utf8", timeout: TIMEOUT, cwd, stdio: ["ignore", "pipe", "pipe"] });

/** Map one Slurm state token to lab state. CANCELLED may carry "by <uid>". */
export function mapState(raw: string): LabState | "unknown" {
	const s = raw.trim().split(/\s+/)[0].replace(/\+$/, "").toUpperCase();
	if (["PENDING", "CONFIGURING", "REQUEUED", "REQUEUE_HOLD", "REQUEUE_FED", "RESV_DEL_HOLD", "SPECIAL_EXIT"].includes(s)) return "queued";
	if (["RUNNING", "COMPLETING", "SUSPENDED", "STAGE_OUT", "SIGNALING", "RESIZING", "STOPPED"].includes(s)) return "running";
	if (s === "COMPLETED") return "done";
	if (["FAILED", "CANCELLED", "TIMEOUT", "OUT_OF_MEMORY", "NODE_FAIL", "PREEMPTED", "BOOT_FAIL", "DEADLINE", "REVOKED"].includes(s)) return "failed";
	return "unknown";
}

/** "a:b" -> exit code; a signal b>0 maps to 128+b like a shell. */
export function parseExit(code: string): number | undefined {
	const m = /^(\d+):(\d+)$/.exec(code.trim());
	if (!m) return undefined;
	return Number(m[2]) > 0 ? 128 + Number(m[2]) : Number(m[1]);
}

/** Base job id of an array/het task id like 123_4, 123_[5-9], 123+0. */
export const baseId = (id: string) => id.trim().split(/[_+.]/)[0];

/** squeue -h -o '%i|%T' output -> live states per base id. */
export function parseSqueue(out: string): Map<string, string[]> {
	const m = new Map<string, string[]>();
	for (const l of out.split("\n").map((x) => x.trim()).filter(Boolean)) {
		const [id, st] = l.split("|");
		if (!id || !st) continue;
		const b = baseId(id); m.set(b, [...(m.get(b) ?? []), st]);
	}
	return m;
}

export interface SacctRow { id: string; state: string; exit: string; end: string }
/** sacct -n -P -X -o JobID,State,ExitCode,End output -> rows per base id. */
export function parseSacct(out: string): Map<string, SacctRow[]> {
	const m = new Map<string, SacctRow[]>();
	for (const l of out.split("\n").map((x) => x.trim()).filter(Boolean)) {
		const [id, state, exit, end] = l.split("|");
		if (!id || !state) continue;
		const b = baseId(id); m.set(b, [...(m.get(b) ?? []), { id, state, exit: exit ?? "", end: end ?? "" }]);
	}
	return m;
}

/**
 * Combine scheduler evidence for one job (all array tasks). Live squeue rows win;
 * otherwise sacct must show every task terminal. Returns undefined when there is
 * no evidence at all (caller applies the missing-record grace period).
 */
export function combine(live: string[] | undefined, rows: SacctRow[] | undefined): SlurmStatus | undefined {
	if (live?.length) {
		const st = live.map(mapState);
		const state: LabState = st.includes("running") ? "running" : "queued";
		return { state, detail: `squeue: ${[...new Set(live)].join(",")}` };
	}
	if (!rows?.length) return undefined;
	const st = rows.map((r) => mapState(r.state));
	if (st.some((s) => s === "queued" || s === "running" || s === "unknown"))
		return { state: st.includes("running") ? "running" : "queued", detail: `sacct: ${[...new Set(rows.map((r) => r.state))].join(",")}` };
	const failed = rows.filter((r) => mapState(r.state) === "failed" || parseExit(r.exit) !== 0);
	const ends = rows.map((r) => r.end).filter((e) => /^\d{4}-/.test(e)).sort();
	const ended = ends.length ? new Date(ends[ends.length - 1]).toISOString() : undefined;
	if (!failed.length) return { state: "done", exit: 0, ended, detail: rows.length > 1 ? `${rows.length} tasks COMPLETED` : "COMPLETED 0:0" };
	const first = failed[0];
	const code = parseExit(first.exit);
	return {
		state: "failed", exit: code === 0 || code === undefined ? 1 : code, ended,
		detail: `${failed.length}/${rows.length} task(s) not successful; first ${first.id} ${first.state} ${first.exit}`,
	};
}

/** Query a batch of base job ids. Throws if both scheduler commands fail. */
export function query(ids: string[]): Map<string, SlurmStatus | undefined> {
	const res = new Map<string, SlurmStatus | undefined>();
	if (!ids.length) return res;
	let live = new Map<string, string[]>(), acct = new Map<string, SacctRow[]>();
	let ok = false;
	try { live = parseSqueue(run("squeue", ["-h", "-j", ids.join(","), "-o", "%i|%T"])); ok = true; } catch { /* finished ids can make squeue error */ }
	try { acct = parseSacct(run("sacct", ["-n", "-P", "-X", "-j", ids.join(","), "-o", "JobID,State,ExitCode,End"])); ok = true; } catch { /* accounting unavailable */ }
	if (!ok) throw new Error("squeue and sacct both failed");
	for (const id of ids) res.set(id, combine(live.get(id), acct.get(id)));
	return res;
}

/** Build sbatch CLI args (options only; script path appended by caller). */
export function sbatchArgs(r: SlurmRequest, name: string, cwd: string, log?: string): string[] {
	const a = ["--parsable", `--job-name=${name}`, `--chdir=${cwd}`];
	if (r.account) a.push(`--account=${r.account}`);
	if (r.partition) a.push(`--partition=${r.partition}`);
	if (r.time) a.push(`--time=${r.time}`);
	if (r.cpus) a.push("--nodes=1", "--ntasks=1", `--cpus-per-task=${r.cpus}`);
	if (r.mem) a.push(`--mem=${r.mem}`);
	if (r.gpus) a.push(`--gres=gpu:${r.gpus}`);
	if (r.dependency) a.push(`--dependency=${r.dependency}`);
	if (r.array) a.push(`--array=${r.array}`);
	if (log) a.push(`--output=${log}`);
	return [...a, ...(r.extra ?? [])];
}

/** Wrapper script body: optional conda activation, then the user command. */
export function wrapCommand(command: string, conda?: string): string {
	const init = conda ? [
		'CONDA_ROOT="${CONDA_ROOT:-$HOME/miniforge}"',
		'[ -d /home/pxl1051/project_shortcut/miniforge ] && CONDA_ROOT=/home/pxl1051/project_shortcut/miniforge',
		'[ -d "$CONDA_ROOT" ] || CONDA_ROOT="$HOME/anaconda3"',
		'source "$CONDA_ROOT/bin/activate" "" || { echo "[lab] conda base activation failed" >&2; exit 1; }',
		`conda activate ${conda} || { echo "[lab] conda activate ${conda} failed" >&2; exit 1; }`,
	].join("\n") + "\n" : "";
	return `#!/bin/bash\nexport MPLBACKEND=\${MPLBACKEND:-Agg}\n${init}${command}\n`;
}

export function parseParsable(out: string): string {
	const id = out.trim().split("\n").pop()?.split(";")[0].trim() ?? "";
	if (!/^\d+$/.test(id)) throw new Error(`sbatch returned unexpected output: ${out.trim().slice(0, 200)}`);
	return id;
}

export function submit(args: string[], script: string, cwd: string, scriptArgs: string[] = []): string {
	return parseParsable(run("sbatch", [...args, script, ...scriptArgs], cwd));
}

/** StdOut path from scontrol (resolved %j); undefined if unavailable. */
export function stdoutPath(id: string): string | undefined {
	try {
		const m = /StdOut=(\S+)/.exec(run("scontrol", ["show", "job", "-o", id]));
		return m?.[1];
	} catch { return undefined; }
}

export function cancel(id: string) { run("scancel", [id]); }
