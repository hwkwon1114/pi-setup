/**
 * Usage Limits Display Extension
 *
 * Shows subscription usage for every linked account:
 * - Anthropic (Claude) OAuth accounts: `auth.json` keys `anthropic`, `anthropic-N`
 * - Codex (ChatGPT) OAuth accounts:    `auth.json` keys `openai-codex`, `openai-codex-N`
 * - Antigravity (Gemini/Claude/GPT):   every account in `antigravity-accounts.json`
 * plus `x-ratelimit-*` API headers when a provider returns them.
 *
 * Read-only: tokens are sent only to their own provider's usage endpoint; this
 * extension never refreshes tokens or writes credentials. Expired tokens are
 * reported as such (Pi refreshes the active credentials on use).
 *
 * Footer: only the account(s) and quota pool(s) behind the selected model.
 * `/usage` fetches and lists every linked account.
 *
 * Polling is demand-driven (session start, model select, turn end, /usage)
 * with a per-account cache; no idle timer and nothing is fetched headless.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "./multi-codex/stream.ts";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RateLimitInfo {
	provider: string;
	limitRequests: number | null;
	remainingRequests: number | null;
	limitTokens: number | null;
	remainingTokens: number | null;
	resetRequests: string | null;
	resetTokens: string | null;
	timestamp: number;
}

type Vendor = "anthropic" | "codex" | "antigravity";

interface UsageWindow {
	/** Pool name for multi-pool accounts (Antigravity), else undefined */
	group?: string;
	/** Window label, e.g. "5h", "7d" */
	window: string;
	/** Remaining percent 0–100 */
	remaining: number;
	/** Reset time, ms since epoch */
	resetAt?: number;
}

interface AccountRef {
	/** Stable key: provider id or antigravity:<accountId> */
	key: string;
	vendor: Vendor;
	/** Short footer label */
	label: string;
	/** Longer label for /usage */
	detail?: string;
	/** Provider ids that use this account (for the ▸ marker) */
	providers: string[];
	token?: string;
	expires?: number;
	accountId?: string;
}

interface AccountUsage {
	ref: AccountRef;
	windows: UsageWindow[];
	error?: string;
	note?: string;
	raw: unknown;
	timestamp: number;
}

// ─── Credential discovery ────────────────────────────────────────────────────

const ANTHROPIC_PROVIDER = /^anthropic(?:-([2-9]|[1-9]\d+))?$/;
const CODEX_PROVIDER = /^openai-codex(?:-([2-9]|[1-9]\d+))?$/;
const CACHE_MS = 3 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const ANTIGRAVITY_ENDPOINT = "https://cloudcode-pa.googleapis.com";
const ANTIGRAVITY_UA =
	"antigravity/cli/1.4.0 (aidev_client; os_type=linux; arch=amd64; cl=982146307; auth_method=consumer)";

function readJson(name: string): Record<string, any> {
	try {
		return JSON.parse(readFileSync(join(getAgentDir(), name), "utf8")) ?? {};
	} catch {
		return {};
	}
}

function suffix(provider: string, re: RegExp): string {
	return re.exec(provider)?.[1] ?? "";
}

function jwtEmail(token: unknown): string | undefined {
	if (typeof token !== "string") return undefined;
	try {
		const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
		const email = payload["https://api.openai.com/profile"]?.email ?? payload.email;
		return typeof email === "string" && /^[^\s\x00-\x1f\x7f@]{1,64}@[^\s\x00-\x1f\x7f@]{1,189}$/.test(email)
			? email
			: undefined;
	} catch {
		return undefined;
	}
}

function safeEmail(value: unknown): string | undefined {
	return typeof value === "string" && /^[^\s\x00-\x1f\x7f@]{1,64}@[^\s\x00-\x1f\x7f@]{1,189}$/.test(value)
		? value
		: undefined;
}

/** All linked subscription accounts, in display order. */
export function discoverAccounts(): AccountRef[] {
	const auth = readJson("auth.json");
	const refs: AccountRef[] = [];
	const keys = Object.keys(auth).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

	for (const key of keys) {
		const cred = auth[key];
		if (cred?.type !== "oauth" || typeof cred.access !== "string") continue;
		if (ANTHROPIC_PROVIDER.test(key)) {
			const n = suffix(key, ANTHROPIC_PROVIDER);
			refs.push({ key, vendor: "anthropic", label: `Claude${n}`, providers: [key],
				token: cred.access, expires: cred.expires });
		}
	}
	for (const key of keys) {
		const cred = auth[key];
		if (cred?.type !== "oauth" || typeof cred.access !== "string") continue;
		if (CODEX_PROVIDER.test(key)) {
			const n = suffix(key, CODEX_PROVIDER);
			refs.push({ key, vendor: "codex", label: `Codex${n}`, detail: jwtEmail(cred.access),
				providers: [key], token: cred.access, expires: cred.expires,
				accountId: typeof cred.accountId === "string" ? cred.accountId : undefined });
		}
	}

	// Antigravity: every linked account. The active one's freshest token lives in auth.json.
	const store = readJson("antigravity-accounts.json");
	const active = auth.antigravity?.type === "oauth" ? auth.antigravity : undefined;
	const accounts = store.accounts && typeof store.accounts === "object" ? store.accounts : {};
	const entries = Object.entries(accounts as Record<string, any>);
	const multi = entries.length > 1;
	entries.forEach(([id, acc], i) => {
		if (!acc || typeof acc !== "object") return;
		const email = safeEmail(acc.email);
		const useActive = active && (id === store.activeAccountId || (email && active.email === email))
			&& (active.expires ?? 0) >= (acc.expires ?? 0);
		const src = useActive ? active : acc;
		refs.push({ key: `antigravity:${id}`, vendor: "antigravity",
			label: multi ? `AG${i + 1}` : "AG", detail: email,
			providers: id === store.activeAccountId ? ["antigravity"] : [],
			token: typeof src.access === "string" ? src.access : undefined, expires: src.expires });
	});
	if (entries.length === 0 && active && typeof active.access === "string") {
		refs.push({ key: "antigravity:active", vendor: "antigravity", label: "AG",
			detail: safeEmail(active.email), providers: ["antigravity"],
			token: active.access, expires: active.expires });
	}
	return refs;
}

/** Inspect only credential metadata; never send direct-API tokens to Codex endpoints. */
function isDirectSubscription(provider: string): boolean {
	if (provider !== "openai" && provider !== "openai-2") return false;
	const credential = readJson("auth.json")[provider];
	return credential?.type === "oauth" && Array.isArray(credential.scopes)
		&& credential.scopes.includes("chatgpt.tokens.use.direct");
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function parseNum(val: string | undefined | null): number | null {
	if (val == null) return null;
	const n = Number(val);
	return Number.isFinite(n) ? n : null;
}

function fmtNum(n: number | null): string {
	if (n == null) return "?";
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return `${n}`;
}

function pctBar(used: number | null, total: number | null, width = 10): string {
	if (used == null || total == null || total === 0) return "░".repeat(width);
	const pct = Math.max(0, Math.min(1, (total - used) / total));
	const filled = Math.round(pct * width);
	return "█".repeat(filled) + "░".repeat(width - filled);
}

function fmtDuration(ms: number): string {
	const minutes = Math.max(0, Math.ceil(ms / 60000));
	if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
	if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
	return `${minutes}m`;
}

function windowLabel(seconds: unknown, fallback: string): string {
	if (typeof seconds !== "number" || seconds <= 0) return fallback;
	if (seconds % 86400 === 0) return `${seconds / 86400}d`;
	if (seconds % 3600 === 0) return `${seconds / 3600}h`;
	return `${Math.round(seconds / 60)}m`;
}

function clampPct(x: number): number {
	return Math.round(Math.max(0, Math.min(100, x)) * 10) / 10;
}

function parseTime(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
	if (typeof value === "string") {
		const t = Date.parse(value);
		return Number.isFinite(t) ? t : undefined;
	}
	return undefined;
}

/** Short group name for Antigravity pools in the footer. */
function shortGroup(name: string): string {
	if (/claude.*gpt|gpt.*claude/i.test(name)) return "Cl/GPT";
	if (/argon/i.test(name)) return "Argon";
	if (/^gemini models?$/i.test(name)) return "Gem";
	return name.replace(/\s*models?$/i, "");
}

/** Absolute local reset time, e.g. "Mon Nov 3 09:59". */
export function fmtResetDate(resetAt: number): string {
	const d = new Date(resetAt);
	const wd = d.toLocaleDateString("en-US", { weekday: "short" });
	const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
	const hm = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
	return `${wd} ${md} ${hm}`;
}

/** Compact reset for the footer: relative under 24h ("2h35m"), else weekday + time ("Mon 09:59"). */
export function fmtResetShort(resetAt: number, now = Date.now()): string {
	const ms = resetAt - now;
	if (ms <= 0) return "now";
	if (ms < 86_400_000) return fmtDuration(ms).replace(" ", "");
	const d = new Date(resetAt);
	const wd = d.toLocaleDateString("en-US", { weekday: "short" });
	const hm = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
	return ms < 6 * 86_400_000 ? `${wd} ${hm}` : `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${hm}`;
}

function windowText(w: UsageWindow): string {
	const reset = w.resetAt ? ` ↻${fmtResetShort(w.resetAt)}` : "";
	return `${w.window} ${Math.round(w.remaining)}%${reset}`;
}

/**
 * Windows relevant to the selected model: the Antigravity pool the model draws
 * from (Argon / Claude+GPT / Gemini), and for Anthropic the shared 5h/7d windows
 * plus the model-family weekly window (Opus/Sonnet) when the account reports one.
 */
export function windowsForModel(u: AccountUsage, modelId = ""): UsageWindow[] {
	const id = modelId.toLowerCase();
	if (u.ref.vendor === "antigravity") {
		const want = /argon/.test(id) ? /argon/i : /claude|gpt/.test(id) ? /claude|gpt/i
			: /gemini/.test(id) ? /^gemini models?$/i : undefined;
		const hit = want ? u.windows.filter(w => w.group !== undefined && want.test(w.group)) : [];
		return hit.length ? hit : u.windows;
	}
	if (u.ref.vendor === "anthropic") {
		return u.windows.filter(w => !w.window.startsWith("7d ")
			|| (/opus/.test(id) && w.window === "7d Opus") || (/sonnet/.test(id) && w.window === "7d Sonnet"));
	}
	return u.windows;
}

/** Compact footer fragment for one account. */
function compactAccount(u: AccountUsage, windows: UsageWindow[] = u.windows): string {
	const label = u.ref.label;
	if (u.error) return `${label} ${u.error}`;
	if (windows.length === 0) return `${label} ?`;
	const groups = new Map<string, UsageWindow[]>();
	for (const w of windows) {
		const g = w.group ?? "";
		if (!groups.has(g)) groups.set(g, []);
		groups.get(g)!.push(w);
	}
	const parts = [...groups].map(([g, ws]) =>
		(g ? `${shortGroup(g)} ` : "") + ws.map(windowText).join(" "));
	return `${label} ${parts.join(", ")}`;
}

// ─── Parsers (exported for tests) ────────────────────────────────────────────

/** Anthropic `GET /api/oauth/usage` → windows. `utilization` is percent used. */
export function parseAnthropicUsage(data: unknown): UsageWindow[] {
	if (!data || typeof data !== "object") return [];
	const d = data as Record<string, any>;
	const out: UsageWindow[] = [];
	const known: [string, string][] = [
		["five_hour", "5h"], ["seven_day", "7d"], ["seven_day_opus", "7d Opus"],
		["seven_day_sonnet", "7d Sonnet"], ["seven_day_oauth_apps", "7d apps"],
	];
	for (const [key, label] of known) {
		const v = d[key];
		if (!v || typeof v !== "object" || typeof v.utilization !== "number") continue;
		out.push({ window: label, remaining: clampPct(100 - v.utilization), resetAt: parseTime(v.resets_at) });
	}
	return out;
}

/** ChatGPT `GET /backend-api/wham/usage` → windows. */
export function parseCodexUsage(data: unknown): { windows: UsageWindow[]; note?: string } {
	if (!data || typeof data !== "object") return { windows: [] };
	const rl = (data as Record<string, any>).rate_limit;
	if (!rl || typeof rl !== "object") return { windows: [] };
	const windows: UsageWindow[] = [];
	for (const [key, fallback] of [["primary_window", "primary"], ["secondary_window", "secondary"]]) {
		const w = rl[key];
		if (!w || typeof w !== "object") continue;
		const used = w.used_percent;
		if (typeof used !== "number" || !Number.isFinite(used)) continue;
		windows.push({ window: windowLabel(w.limit_window_seconds, fallback), remaining: clampPct(100 - used),
			resetAt: parseTime(w.reset_at) });
	}
	const note = rl.limit_reached === true || rl.allowed === false ? "limit reached" : undefined;
	return { windows, note };
}

/** Antigravity `POST /v1internal:retrieveUserQuotaSummary` → windows. */
export function parseAntigravityUsage(data: unknown): UsageWindow[] {
	if (!data || typeof data !== "object") return [];
	const groups = (data as Record<string, any>).groups;
	if (!Array.isArray(groups)) return [];
	const out: UsageWindow[] = [];
	for (const g of groups) {
		if (!g || typeof g !== "object" || !Array.isArray(g.buckets)) continue;
		const group = String(g.displayName || "Quota");
		const buckets = [...g.buckets].sort((a: any, b: any) =>
			(a?.window === "5h" ? 0 : 1) - (b?.window === "5h" ? 0 : 1));
		for (const b of buckets) {
			if (!b || typeof b.remainingFraction !== "number") continue;
			const win = b.window === "weekly" ? "wk" : String(b.window || b.displayName || "?");
			out.push({ group, window: win, remaining: clampPct(b.remainingFraction * 100), resetAt: parseTime(b.resetTime) });
		}
	}
	return out;
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

async function getJson(url: string, init: RequestInit): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
	try {
		const res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
		if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
		return { ok: true, data: await res.json() };
	} catch {
		return { ok: false, error: "fetch error" };
	}
}

export async function fetchAccountUsage(ref: AccountRef): Promise<AccountUsage> {
	const base = { ref, windows: [] as UsageWindow[], raw: null as unknown, timestamp: Date.now() };
	if (!ref.token) return { ...base, error: "no token" };
	if (typeof ref.expires === "number" && ref.expires <= Date.now()) {
		return { ...base, error: "token expired",
			note: ref.vendor === "antigravity" ? "switch to this account (/antigravity.accounts) to refresh" : "use this provider once to refresh" };
	}

	let r: Awaited<ReturnType<typeof getJson>>;
	if (ref.vendor === "anthropic") {
		r = await getJson("https://api.anthropic.com/api/oauth/usage", {
			headers: { Authorization: `Bearer ${ref.token}`, "anthropic-beta": "oauth-2025-04-20",
				"User-Agent": "claude-cli/2.0.0", Accept: "application/json" },
		});
		if (!r.ok) return { ...base, error: r.error, raw: { error: r.error } };
		return { ...base, raw: r.data, windows: parseAnthropicUsage(r.data) };
	}
	if (ref.vendor === "codex") {
		const headers: Record<string, string> = { Authorization: `Bearer ${ref.token}`, "User-Agent": "Pi-CodingAgent/1.0" };
		if (ref.accountId) headers["ChatGPT-Account-Id"] = ref.accountId;
		r = await getJson("https://chatgpt.com/backend-api/wham/usage", { headers });
		if (!r.ok) return { ...base, error: r.error, raw: { error: r.error } };
		const { windows, note } = parseCodexUsage(r.data);
		return { ...base, raw: r.data, windows, note };
	}
	const endpoint = process.env.ANTIGRAVITY_BASE_URL?.trim() || ANTIGRAVITY_ENDPOINT;
	r = await getJson(`${endpoint}/v1internal:retrieveUserQuotaSummary`, {
		method: "POST",
		headers: { Authorization: `Bearer ${ref.token}`, "Content-Type": "application/json",
			Accept: "application/json", "User-Agent": process.env.ANTIGRAVITY_USER_AGENT || ANTIGRAVITY_UA },
		body: "{}",
	});
	if (!r.ok) return { ...base, error: r.error, raw: { error: r.error } };
	return { ...base, raw: r.data, windows: parseAntigravityUsage(r.data) };
}

// ─── Extension ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	const rateLimits = new Map<string, RateLimitInfo>();
	const usage = new Map<string, AccountUsage>();
	let accounts: AccountRef[] = [];
	let generation = 0;
	const pending = new Map<string, Promise<void>>();
	let lastActiveProvider: string | undefined;
	/** Physical Codex account last used by the `codex-auto` router. */
	let routedCodex: string | undefined;
	// Observations are model-specific, not inferred percentages or permanent account state.
	const subscriptionBlocked = new Set<string>();
	const directSubscriptions = new Set<string>();
	function refreshSubscriptionMetadata() {
		directSubscriptions.clear();
		for (const provider of ["openai", "openai-2"]) {
			if (isDirectSubscription(provider)) directSubscriptions.add(provider);
		}
	}

	/** Accounts backing the selected model (codex-auto → routed account, else all Codex). */
	function selectedAccounts(ctx: ExtensionContext): AccountRef[] {
		const provider = ctx.model?.provider;
		if (!provider) return [];
		if (provider === "codex-auto") {
			const codex = accounts.filter(a => a.vendor === "codex");
			const routed = codex.filter(a => a.key === routedCodex);
			return routed.length ? routed : codex;
		}
		return accounts.filter(a => a.providers.includes(provider));
	}

	pi.on("message_end", (event, ctx) => {
		const message = event.message;
		if (message.role !== "assistant") return;
		if (ctx.model?.provider === "codex-auto" && CODEX_PROVIDER.test(message.provider ?? "")
			&& message.provider !== routedCodex) {
			routedCodex = message.provider;
			updateStatus(ctx);
			void refreshUsage(ctx);
		}
		if (!directSubscriptions.has(message.provider)) return;
		const key = `${message.provider}/${message.model}`;
		if (message.errorMessage?.includes("subscription_sharing_usage_limit_exceeded")) {
			subscriptionBlocked.add(key);
		} else if (message.stopReason !== "error" && message.stopReason !== "aborted") {
			subscriptionBlocked.delete(key);
		}
		updateStatus(ctx);
	});

	// ─── Capture rate-limit headers from API responses ───────────────────

	pi.on("after_provider_response", (event, ctx) => {
		const h = event.headers;
		if (!h) return;
		const has = h["x-ratelimit-limit-requests"] || h["x-ratelimit-remaining-requests"]
			|| h["x-ratelimit-limit-tokens"] || h["x-ratelimit-remaining-tokens"];
		if (!has) return;
		const provider = ctx.model?.provider || "unknown";
		rateLimits.set(provider, {
			provider,
			limitRequests: parseNum(h["x-ratelimit-limit-requests"]),
			remainingRequests: parseNum(h["x-ratelimit-remaining-requests"]),
			limitTokens: parseNum(h["x-ratelimit-limit-tokens"]),
			remainingTokens: parseNum(h["x-ratelimit-remaining-tokens"]),
			resetRequests: h["x-ratelimit-reset-requests"] ?? null,
			resetTokens: h["x-ratelimit-reset-tokens"] ?? null,
			timestamp: Date.now(),
		});
		lastActiveProvider = provider;
		updateStatus(ctx);
	});

	// Demand-driven, per-account cache. Default: only the selected model's
	// account(s); `all` (the /usage command) fetches every linked account.
	async function refreshUsage(ctx: ExtensionContext, opts: { force?: boolean; all?: boolean } = {}) {
		if (!ctx.hasUI) return;
		accounts = discoverAccounts();
		const targets = opts.all ? accounts : selectedAccounts(ctx);
		const started = generation;
		const waits: Promise<void>[] = [];
		for (const ref of targets) {
			let request = pending.get(ref.key);
			const cached = usage.get(ref.key);
			if (!request && (opts.force || !cached || Date.now() - cached.timestamp >= CACHE_MS)) {
				const req: Promise<void> = fetchAccountUsage(ref).then(result => {
					if (started === generation) usage.set(ref.key, result);
				});
				request = req;
				pending.set(ref.key, req);
				void req.finally(() => { if (pending.get(ref.key) === req) pending.delete(ref.key); });
			}
			if (request) waits.push(request);
		}
		if (waits.length === 0) return;
		await Promise.all(waits);
		if (started === generation) updateStatus(ctx);
	}

	function isCurrent(ref: AccountRef, ctx: ExtensionContext): boolean {
		return selectedAccounts(ctx).some(a => a.key === ref.key);
	}

	function updateStatus(ctx: ExtensionContext) {
		if (!ctx.hasUI) return;
		const provider = ctx.model?.provider || lastActiveProvider;
		const parts: string[] = [];
		const ctxUsage = ctx.getContextUsage();
		if (ctxUsage?.tokens != null) parts.push(`ctx ${fmtNum(ctxUsage.tokens)}/${fmtNum(ctxUsage.contextWindow)}`);

		if (provider && directSubscriptions.has(provider)) {
			parts.push(subscriptionBlocked.has(`${provider}/${ctx.model?.id}`)
				? "subscription: last request hit quota"
				: "subscription: remaining quota unknown");
		}

		const rl = provider ? rateLimits.get(provider) : undefined;
		if (rl && Date.now() - rl.timestamp < 300_000) {
			if (rl.remainingRequests != null && rl.limitRequests != null) parts.push(`RPM:${rl.remainingRequests}/${fmtNum(rl.limitRequests)}`);
			if (rl.remainingTokens != null && rl.limitTokens != null) parts.push(`TPM:${fmtNum(rl.remainingTokens)}/${fmtNum(rl.limitTokens)}`);
		}

		// Footer: only the account(s) and quota pool(s) that the selected model draws from.
		for (const ref of selectedAccounts(ctx)) {
			const u = usage.get(ref.key);
			if (!u || Date.now() - u.timestamp > 15 * 60_000) continue;
			parts.push(compactAccount(u, windowsForModel(u, ctx.model?.id)));
		}

		ctx.ui.setStatus("usage-limits", parts.length ? `⚡ ${parts.join(" │ ")}` : undefined);
	}

	// ─── Session lifecycle ───────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		generation++;
		pending.clear();
		usage.clear();
		routedCodex = undefined;
		// Restore the routed Codex account from the latest assistant message on this branch.
		try {
			const entries = ctx.sessionManager?.getBranch?.() ?? [];
			for (let i = entries.length - 1; i >= 0; i--) {
				const msg = entries[i]?.message;
				if (msg?.role !== "assistant") continue;
				if (CODEX_PROVIDER.test(msg.provider ?? "")) routedCodex = msg.provider;
				break;
			}
		} catch { /* display only */ }
		refreshSubscriptionMetadata();
		updateStatus(ctx);
		await refreshUsage(ctx);
	});

	pi.on("session_shutdown", () => {
		generation++;
		pending.clear();
	});

	pi.on("model_select", async (_event, ctx) => {
		refreshSubscriptionMetadata();
		lastActiveProvider = ctx.model?.provider;
		if (ctx.model?.provider !== "codex-auto") routedCodex = undefined;
		updateStatus(ctx);
		await refreshUsage(ctx);
	});

	// Display only: native model-aware compaction owns the between-turn pause
	// and continuation. Manual ctx.compact() here would abort the active loop.
	// Never block the agent loop on the network: refresh in the background.
	pi.on("turn_end", (_event, ctx) => {
		updateStatus(ctx);
		void refreshUsage(ctx);
	});

	// ─── /usage command ──────────────────────────────────────────────────

	pi.registerCommand("usage", {
		description: "Show usage limits for all Anthropic, Codex and Antigravity accounts (/usage refresh | raw)",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) return;
			refreshSubscriptionMetadata();
			const arg = args.trim();
			if (arg === "refresh") ctx.ui.notify("Refreshing usage data…", "info");
			await refreshUsage(ctx, { force: arg === "refresh", all: true });

			const theme = ctx.ui.theme;
			const lines: string[] = [theme.fg("accent", "═══ Usage Limits ═══"), ""];
			const vendorTitle: Record<Vendor, string> = {
				anthropic: "Anthropic (Claude subscription)",
				codex: "ChatGPT / Codex subscription",
				antigravity: "Google Antigravity (shared pools)",
			};

			for (const vendor of ["anthropic", "codex", "antigravity"] as Vendor[]) {
				const items = [...usage.values()].filter(u => u.ref.vendor === vendor);
				if (items.length === 0) continue;
				lines.push(theme.fg("accent", vendorTitle[vendor]));
				for (const u of items) {
					const age = Math.round((Date.now() - u.timestamp) / 1000);
					const ageStr = age < 60 ? `${age}s ago` : `${Math.round(age / 60)}m ago`;
					const marker = isCurrent(u.ref, ctx) ? theme.fg("accent", "▸") : " ";
					const name = u.ref.key.startsWith("antigravity:") ? u.ref.label : u.ref.key;
					lines.push(`  ${marker} ${theme.fg("text", name)}${u.ref.detail ? ` <${u.ref.detail}>` : ""} ${theme.fg("dim", `(${ageStr})`)}`);
					if (u.error) lines.push(`      ${u.error}${u.note ? theme.fg("dim", ` — ${u.note}`) : ""}`);
					let group: string | undefined;
					for (const w of u.windows) {
						if (w.group !== group) {
							group = w.group;
							if (group) lines.push(`      ${group}`);
						}
						const bar = pctBar(100 - w.remaining, 100, 15);
						const reset = w.resetAt ? theme.fg("dim", ` resets in ${fmtDuration(w.resetAt - Date.now())} (${fmtResetDate(w.resetAt)})`) : "";
						lines.push(`      ${group ? "  " : ""}${w.window.padEnd(9)} ${bar} ${String(w.remaining).padStart(5)}% left${reset}`);
					}
					if (!u.error && u.note) lines.push(`      ${u.note}`);
					if (!u.error && u.windows.length === 0) lines.push("      usage format not recognised (see /usage raw)");
					if (arg === "raw" || arg === "detail") {
						lines.push(theme.fg("dim", `      Raw: ${JSON.stringify(u.raw, null, 2).split("\n").join("\n      ")}`));
					}
				}
				lines.push("");
			}

			if (directSubscriptions.size > 0) {
				lines.push(theme.fg("accent", "OpenAI subscription sharing (Responses API)"));
				for (const provider of directSubscriptions) {
					lines.push(`    ${provider}: remaining quota unknown (no verified polling endpoint)`);
					for (const key of subscriptionBlocked) {
						if (key.startsWith(`${provider}/`)) lines.push(`      ${key}: last request hit subscription quota`);
					}
				}
				lines.push("");
			}

			if (rateLimits.size > 0) {
				lines.push(theme.fg("accent", "API Rate Limits") + theme.fg("dim", " (from response headers)"));
				for (const [provider, rl] of rateLimits) {
					const age = Math.round((Date.now() - rl.timestamp) / 1000);
					lines.push(`    ${provider} ${theme.fg("dim", `(${age < 60 ? `${age}s` : `${Math.round(age / 60)}m`} ago)`)}`);
					if (rl.limitRequests != null) {
						lines.push(`      Requests: ${pctBar(rl.limitRequests - (rl.remainingRequests ?? 0), rl.limitRequests, 15)} ${fmtNum(rl.remainingRequests)}/${fmtNum(rl.limitRequests)}`
							+ (rl.resetRequests ? theme.fg("dim", ` resets in ${rl.resetRequests}`) : ""));
					}
					if (rl.limitTokens != null) {
						lines.push(`      Tokens:   ${pctBar(rl.limitTokens - (rl.remainingTokens ?? 0), rl.limitTokens, 15)} ${fmtNum(rl.remainingTokens)}/${fmtNum(rl.limitTokens)}`
							+ (rl.resetTokens ? theme.fg("dim", ` resets in ${rl.resetTokens}`) : ""));
					}
				}
				lines.push("");
			}

			if (usage.size === 0 && rateLimits.size === 0 && directSubscriptions.size === 0) {
				lines.push(theme.fg("dim", "  No linked subscription accounts found."), "");
			}
			lines.push(theme.fg("dim", "Commands: /usage refresh · /usage raw"));
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
