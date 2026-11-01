/**
 * lab — research job runner for Pi.
 *
 * - `job_start` tool: launches a detached shell job (survives Pi restarts), assigns GPUs under the nearest `.pi/lab.json`
 *   policy (allowed GPUs, max per job; a GPU is free only if no compute process runs on it and no lab job reserves it), records provenance
 *   (command, sha256 of declared input files, git HEAD/dirty state of the cwd repo), optional `after` dependency.
 * - Wakes the session that started a job when it exits (sendMessage triggerTurn), with exit code, duration, log tail and the
 *   job's `on_done` instruction. Other sessions only see it in /jobs and the footer.
 * - `job_list` tool and `/jobs` command; footer status "lab: N running".
 * - Guard: blocks bash commands that set CUDA_VISIBLE_DEVICES to a GPU outside the policy.
 *
 * - State block: before every agent run, injects a `lab_state` system-prompt section re-read from files: the nearest
 *   RESEARCH_STATE.md (dashboard), the session's active card (path + Status/Stage lines) and running/queued lab jobs.
 *   Files stay authoritative; this only keeps them in view when the conversation is compressed.
 * - `/card <ID>`: starts a fresh session bound to card <ID> (custom entry `lab-card`) and pre-fills a kickoff prompt;
 *   `/card <ID> here` binds the current session; `/card` lists cards. Jobs tagged with the active card wake that session
 *   even if another session started them.
 *
 * Registry: <dir of lab.json>/lab/jobs/<id>.{json,sh,log,exit}. No lab.json -> CPU-only jobs (gpus must be 0).
 */
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

interface Policy { allowed_gpus: number[]; max_gpus_per_job: number; notes?: string }
interface Job {
	id: string; name: string; card?: string; cwd: string; command: string; gpus: number[]; after?: string; on_done?: string;
	log: string; exitFile: string; pid?: number; session?: string; started: string; ended?: string;
	status: "queued" | "running" | "done" | "failed" | "lost"; exit?: number; inputs?: Record<string, string>;
	git?: { head?: string; dirty?: string[] }; notified?: boolean;
}

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
	const f = path.join(jobsDir(root), `${j.id}.json`); fs.writeFileSync(f + ".tmp", JSON.stringify(j, null, 1)); fs.renameSync(f + ".tmp", f);
}
const alive = (pid?: number) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch { return false; } };
const sha = (f: string) => createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const dur = (a: string, b?: string) => { const s = Math.round(((b ? Date.parse(b) : Date.now()) - Date.parse(a)) / 1000); return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`; };
const tail = (f: string, n = 15) => { try { return fs.readFileSync(f, "utf8").split("\n").slice(-n - 1).join("\n").slice(-3000); } catch { return "(no log)"; } };

/** GPUs with any running compute process (memory alone is unreliable: JAX jobs may hold <1 GB). */
function gpuBusy(): Set<number> {
	const q = (a: string) => execFileSync("nvidia-smi", [a, "--format=csv,noheader"], { encoding: "utf8", timeout: 20000 }).trim().split("\n").filter(Boolean).map((l) => l.split(",").map((x) => x.trim()));
	const idx = new Map(q("--query-gpu=index,uuid").map(([i, u]) => [u, Number(i)]));
	return new Set(q("--query-compute-apps=gpu_uuid,pid").map(([u]) => idx.get(u)).filter((g): g is number => g !== undefined));
}

/** Refresh job states from exit files / pids. Returns jobs that newly finished. */
function refresh(root: string): Job[] {
	const fin: Job[] = [];
	for (const j of readJobs(root)) {
		if (j.status !== "running" && j.status !== "queued") continue;
		if (fs.existsSync(j.exitFile)) {
			const code = Number(fs.readFileSync(j.exitFile, "utf8").trim());
			j.exit = code; j.status = code === 0 ? "done" : "failed"; j.ended = new Date(fs.statSync(j.exitFile).mtimeMs).toISOString();
			writeJob(root, j); fin.push(j);
		} else if (!alive(j.pid)) { j.status = "lost"; j.ended = new Date().toISOString(); writeJob(root, j); fin.push(j); }
		else if (j.status === "queued" && fs.existsSync(j.log.replace(/\.log$/, ".started"))) { j.status = "running"; writeJob(root, j); }
	}
	return fin;
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
	return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith(".md") && f !== "TEMPLATE.md" && f !== "VERIFIER_PROMPT.md").sort() : [];
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
	const g = (j: Job) => (j.gpus.length ? `gpu ${j.gpus.join(",")}` : "cpu");
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

function line(j: Job) {
	const g = j.gpus.length ? `gpu ${j.gpus.join(",")}` : "cpu";
	const e = j.exit !== undefined ? ` exit=${j.exit}` : "";
	return `${j.id}  ${j.status.padEnd(7)} ${dur(j.started, j.ended).padStart(7)}  ${g.padEnd(9)} ${j.card ?? "-"}  ${j.name}${e}`;
}

export default function (pi: ExtensionAPI) {
	let timer: ReturnType<typeof setInterval> | undefined;
	let sessionId = "";
	let activeCard: string | undefined;

	const stateBlock = (cwd: string): string | undefined => {
		const proj = findProject(cwd);
		if (!proj) return undefined;
		let dash = "";
		try { dash = fs.readFileSync(path.join(proj, "RESEARCH_STATE.md"), "utf8").trim(); } catch { return undefined; }
		if (dash.length > 6000) dash = dash.slice(0, 6000) + "\n\u2026 (truncated; read RESEARCH_STATE.md)";
		const cf = activeCard ? findCard(proj, activeCard) : undefined;
		const card = activeCard
			? (cf ? `Active card (this session): ${activeCard} \u2014 ${path.join(proj, cf)}\n${cardHeader(path.join(proj, cf))}` : `Active card: ${activeCard} (card file not found)`)
			: "Active card: none bound (use /card <ID>); infer from the dashboard and ask if unclear.";
		let jobs = "";
		try {
			const { root } = findPolicy(cwd);
			const act = readJobs(root).filter((j) => j.status === "running" || j.status === "queued");
			// Stable text (no durations): the section is re-sent as a transcript delta only when it changes.
			jobs = summarizeActive(act);
		} catch { jobs = "(registry unreadable)"; }
		return [
			"Re-read from files before this turn. Files are authoritative over conversation memory and compressed summaries.",
			"Record anything needed later (commands, job IDs, decisions, numbers) in the card or DECISIONS.md, not only in chat.",
			"", card, "", `Lab jobs running/queued:\n${jobs}`, "", `--- ${path.join(proj, "RESEARCH_STATE.md")} ---`, dash,
		].join("\n");
	};

	const report = (j: Job) =>
		`[lab] Job ${j.id} "${j.name}"${j.card ? ` (card ${j.card})` : ""} ${j.status.toUpperCase()}` +
		`${j.exit !== undefined ? ` exit=${j.exit}` : ""} after ${dur(j.started, j.ended)}. Log: ${j.log}\n` +
		"```\n" + tail(j.log) + "\n```\n" +
		(j.on_done ? `Planned next step (from job_start on_done): ${j.on_done}\n` : "") +
		"Verify outputs before reporting; a zero exit code is not evidence the results are correct.";

	const poll = (ctx: ExtensionContext) => {
		const { root } = findPolicy(ctx.cwd);
		let fin: Job[] = [];
		try { fin = refresh(root); } catch { return; }
		for (const j of fin) {
			if (j.notified) continue;
			const mine = j.session === sessionId || (!!activeCard && j.card === activeCard);
			j.notified = mine; writeJob(root, j);
			if (mine) pi.sendMessage({ customType: "lab-job", content: report(j), display: true }, ctx.isIdle() ? { triggerTurn: true } : { deliverAs: "followUp", triggerTurn: true });
			else if (ctx.hasUI) ctx.ui.notify(`lab: job ${j.id} ${j.status} (${j.name})`, j.status === "done" ? "info" : "warning");
		}
		if (ctx.hasUI) {
			const act = readJobs(root).filter((j) => j.status === "running" || j.status === "queued");
			ctx.ui.setStatus("lab", act.length ? `lab: ${act.filter((j) => j.status === "running").length} running, ${act.filter((j) => j.status === "queued").length} queued` : undefined);
		}
	};

	pi.on("session_start", async (_e, ctx) => {
		sessionId = ctx.sessionManager.getSessionId();
		activeCard = undefined;
		try {
			for (const e of ctx.sessionManager.getBranch() as Array<{ type: string; customType?: string; data?: { card?: string } }>)
				if (e.type === "custom" && e.customType === "lab-card") activeCard = e.data?.card;
		} catch { /* no branch */ }
		if (ctx.hasUI) ctx.ui.setStatus("lab-card", activeCard ? `card: ${activeCard}` : undefined);
		// Report jobs that finished while no session of theirs was running (display only; no automatic turn).
		const { root } = findPolicy(ctx.cwd);
		try {
			refresh(root);
			const missed = readJobs(root).filter((j) => ["done", "failed", "lost"].includes(j.status) && !j.notified);
			for (const j of missed) { j.notified = true; writeJob(root, j); }
			if (missed.length) pi.sendMessage({ customType: "lab-job", content: missed.map(report).join("\n\n"), display: true });
		} catch { /* registry unreadable: ignore at startup */ }
		timer = setInterval(() => poll(ctx), 30000);
		poll(ctx);
	});
	pi.on("session_shutdown", async () => { if (timer) clearInterval(timer); timer = undefined; });

	// Per-turn state block (system-prompt section; Pi appends a transcript delta only when it changes).
	pi.on("before_agent_start", async (event, ctx) => {
		const s = stateBlock(ctx.cwd);
		if (s) event.systemPromptOptions.sections.lab_state = s;
		else delete event.systemPromptOptions.sections.lab_state;
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
		if (!policy) return;
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
			"Launch a long-running command (training, sweeps, simulations) as a detached, tracked job. Prefer this over nohup/& in bash. " +
			"GPUs are assigned under the project lab policy (one job per GPU; CUDA_VISIBLE_DEVICES is set for you — do not set it in the command). " +
			"Records sha256 of `inputs` (code/config files) and git state. When the job exits, this session is woken with exit code, log tail and `on_done`. " +
			"Use `after` to queue behind another job (runs only if that job exits 0).",
		parameters: Type.Object({
			name: Type.String({ description: "Short job name" }),
			command: Type.String({ description: "Shell command (bash). Write outputs to the declared output directory." }),
			cwd: Type.Optional(Type.String({ description: "Working directory (default: session cwd)" })),
			gpus: Type.Optional(Type.Number({ description: "Number of GPUs (default 0 = CPU)" })),
			card: Type.Optional(Type.String({ description: "Card ID this job belongs to, e.g. SD-P2" })),
			inputs: Type.Optional(Type.Array(Type.String(), { description: "Code/config files to hash for provenance" })),
			after: Type.Optional(Type.String({ description: "Job id to wait for (must exit 0)" })),
			on_done: Type.Optional(Type.String({ description: "What the orchestrator should do when this job finishes" })),
		}),
		async execute(_id, p, _signal, _onUpdate, ctx) {
			const cwd = path.resolve(ctx.cwd, p.cwd ?? ".");
			const { policy, root } = findPolicy(cwd);
			const n = p.gpus ?? 0; let gpus: number[] = [];
			refresh(root);
			const jobs = readJobs(root);
			if (p.after && !jobs.find((j) => j.id === p.after)) throw new Error(`after: unknown job ${p.after}`);
			if (/(export\s+)?CUDA_VISIBLE_DEVICES\s*=/.test(p.command)) throw new Error("Do not set CUDA_VISIBLE_DEVICES in the command; request gpus instead.");
			if (n > 0) {
				if (!policy) throw new Error("No .pi/lab.json GPU policy found above cwd; GPU jobs refused.");
				if (n > policy.max_gpus_per_job) throw new Error(`Requested ${n} GPUs > max_gpus_per_job ${policy.max_gpus_per_job}`);
				const reserved = new Set(jobs.filter((j) => j.status === "running" || j.status === "queued").flatMap((j) => j.gpus));
				const busy = gpuBusy();
				// A queued job may reuse the GPU of the job it waits for.
				const pred = p.after ? jobs.find((j) => j.id === p.after) : undefined;
				const free = policy.allowed_gpus.filter((g) => (pred?.gpus.includes(g)) || (!reserved.has(g) && !busy.has(g)));
				if (free.length < n) throw new Error(`Not enough free GPUs: need ${n}, free ${free.join(",") || "none"} (reserved by lab jobs: ${[...reserved].join(",") || "none"}; GPUs with compute processes: ${[...busy].join(",") || "none"}).`);
				gpus = free.slice(0, n);
			}
			const id = `${new Date().toISOString().slice(5, 16).replace(/[-:T]/g, "")}-${Math.random().toString(36).slice(2, 6)}`;
			const d = jobsDir(root), base = path.join(d, id);
			const inputs: Record<string, string> = {};
			for (const f of p.inputs ?? []) { const a = path.resolve(cwd, f); inputs[f] = fs.existsSync(a) ? sha(a) : "MISSING"; }
			let git: Job["git"];
			try {
				git = { head: execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim(),
					dirty: execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" }).split("\n").filter(Boolean).slice(0, 200) };
			} catch { git = undefined; }
			const wait = p.after ? `while [ ! -f ${JSON.stringify(path.join(d, p.after + ".exit"))} ]; do sleep 30; done\n` +
				`[ "$(cat ${JSON.stringify(path.join(d, p.after + ".exit"))})" = 0 ] || { echo "dependency ${p.after} failed"; echo 97 > ${JSON.stringify(base + ".exit")}; exit 0; }\n` : "";
			fs.writeFileSync(base + ".cmd.sh", `#!/bin/bash\n${p.command}\n`);
			fs.writeFileSync(base + ".sh", `#!/bin/bash\n${wait}touch ${JSON.stringify(base + ".started")}\n` +
				`cd ${JSON.stringify(cwd)}\nbash ${JSON.stringify(base + ".cmd.sh")}\necho $? > ${JSON.stringify(base + ".exit.tmp")}; mv ${JSON.stringify(base + ".exit.tmp")} ${JSON.stringify(base + ".exit")}\n`);
			const log = fs.openSync(base + ".log", "a");
			const env = { ...process.env, CUDA_VISIBLE_DEVICES: gpus.length ? gpus.join(",") : "" };
			const child = spawn("bash", [base + ".sh"], { cwd, detached: true, stdio: ["ignore", log, log], env });
			child.unref(); fs.closeSync(log);
			const job: Job = { id, name: p.name, card: p.card, cwd, command: p.command, gpus, after: p.after, on_done: p.on_done,
				log: base + ".log", exitFile: base + ".exit", pid: child.pid, session: sessionId, started: new Date().toISOString(),
				status: p.after ? "queued" : "running", inputs, git };
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
		description: "List lab jobs (status, runtime, GPUs, card). Use instead of ps/nvidia-smi polling.",
		parameters: Type.Object({ all: Type.Optional(Type.Boolean({ description: "Include finished jobs (default: last 20)" })) }),
		async execute(_id, p, _s, _u, ctx) {
			const { root, policy } = findPolicy(ctx.cwd); refresh(root);
			const jobs = readJobs(root); const shown = p.all ? jobs : jobs.slice(-20);
			const txt = (policy ? `policy: GPUs ${policy.allowed_gpus.join(",")}, ≤${policy.max_gpus_per_job}/job\n` : "no GPU policy\n") +
				(shown.map(line).join("\n") || "(no jobs)");
			return { content: [{ type: "text", text: txt }], details: undefined };
		},
	}));

	pi.registerCommand("jobs", {
		description: "Show lab jobs; `/jobs log <id>` shows a log tail; `/jobs kill <id>` stops a job",
		handler: async (args, ctx) => {
			const { root } = findPolicy(ctx.cwd); refresh(root);
			const [cmd, id] = (args ?? "").trim().split(/\s+/);
			const j = id ? readJobs(root).find((x) => x.id === id) : undefined;
			if (cmd === "log" && j) return ctx.ui.notify(tail(j.log, 30), "info");
			if (cmd === "kill" && j?.pid) {
				if (await ctx.ui.confirm("Kill job?", `${j.id} ${j.name}`)) { try { process.kill(-j.pid, "SIGTERM"); } catch { /* gone */ } }
				return;
			}
			ctx.ui.notify(readJobs(root).slice(-20).map(line).join("\n") || "(no jobs)", "info");
		},
	});
}
