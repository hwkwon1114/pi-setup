/**
 * Usage Limits Display Extension
 *
 * Shows rate limit and usage information for OpenAI API and Codex (ChatGPT) providers.
 *
 * - Captures `x-ratelimit-*` headers from OpenAI API responses
 * - Polls `chatgpt.com/backend-api/wham/usage` for Codex subscription usage
 * - Displays a persistent status bar indicator
 * - Provides a `/usage` command for detailed view
 * - Shows one compact usage summary in the footer only
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

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

interface CodexUsageInfo {
	provider: string;
	raw: unknown;
	timestamp: number;
	/** Parsed summary fields (best-effort from the API response) */
	summary: string;
}

interface UsageState {
	/** Rate limits per provider, keyed by provider id */
	rateLimits: Map<string, RateLimitInfo>;
	/** Codex/ChatGPT usage per provider, keyed by provider id */
	codexUsage: Map<string, CodexUsageInfo>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readAuthToken(provider: string): string | undefined {
	try {
		const authPath = join(getAgentDir(), "auth.json");
		const auth = JSON.parse(readFileSync(authPath, "utf8"));
		return auth[provider]?.access;
	} catch {
		return undefined;
	}
}

/** Inspect only credential metadata; never send direct-API tokens to Codex endpoints. */
function isDirectSubscription(provider: string): boolean {
	if (provider !== "openai" && provider !== "openai-2") return false;
	try {
		const credential = JSON.parse(readFileSync(join(getAgentDir(), "auth.json"), "utf8"))[provider];
		return credential?.type === "oauth" && Array.isArray(credential.scopes)
			&& credential.scopes.includes("chatgpt.tokens.use.direct");
	} catch {
		return false;
	}
}

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
	const remaining = total - used;
	const pct = Math.max(0, Math.min(1, remaining / total));
	const filled = Math.round(pct * width);
	return "█".repeat(filled) + "░".repeat(width - filled);
}

/** Try to parse the ChatGPT /wham/usage response into a human-readable summary */
function parseCodexUsageSummary(data: unknown): string {
	if (!data || typeof data !== "object") return "unable to parse";
	const d = data as Record<string, unknown>;

	const parts: string[] = [];

	// WHAM subscription usage nests windows under rate_limit.
	const rateLimit = d.rate_limit;
	if (rateLimit && typeof rateLimit === "object") {
		const limits = rateLimit as Record<string, unknown>;
		for (const [key, fallback] of [["primary_window", "primary"], ["secondary_window", "secondary"]]) {
			const value = limits[key];
			if (!value || typeof value !== "object") continue;
			const window = value as Record<string, unknown>;
			const used = window.used_percent;
			if (typeof used !== "number" || !Number.isFinite(used) || used < 0 || used > 100) continue;
			const seconds = window.limit_window_seconds;
			const label = typeof seconds === "number" && seconds > 0
				? seconds % 86400 === 0 ? `${seconds / 86400}d` : seconds % 3600 === 0 ? `${seconds / 3600}h` : `${Math.round(seconds / 60)}m`
				: fallback;
			const remaining = Math.round((100 - used) * 10) / 10;
			let reset = "";
			if (typeof window.reset_at === "number" && Number.isFinite(window.reset_at)) {
				const minutes = Math.max(0, Math.ceil((window.reset_at * 1000 - Date.now()) / 60000));
				const duration = minutes >= 1440 ? `${Math.floor(minutes / 1440)}d ${Math.floor(minutes % 1440 / 60)}h`
					: minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
				reset = ` (reset ${duration})`;
			}
			parts.push(`${label}: ${remaining}% left${reset}`);
		}
		if (limits.limit_reached === true || limits.allowed === false) parts.push("limit reached");
	}

	// The response format can vary; handle multiple known shapes
	// Shape 1: { categories: [...] } with each having name, usage, limit, resets_at
	if (Array.isArray(d.categories)) {
		for (const cat of d.categories) {
			if (cat && typeof cat === "object") {
				const c = cat as Record<string, unknown>;
				const name = String(c.name || c.category || "unknown");
				if (c.usage != null && c.limit != null) {
					parts.push(`${name}: ${c.usage}/${c.limit}`);
				} else if (c.remaining != null && c.limit != null) {
					parts.push(`${name}: ${Number(c.limit) - Number(c.remaining)}/${c.limit}`);
				} else if (c.messages_remaining != null) {
					parts.push(`${name}: ${c.messages_remaining} remaining`);
				}
				if (c.resets_at || c.reset_at) {
					const resetTs = Number(c.resets_at || c.reset_at);
					if (resetTs > 0) {
						const mins = Math.max(0, Math.round((resetTs * 1000 - Date.now()) / 60000));
						parts[parts.length - 1] += ` (resets ${mins}m)`;
					}
				}
			}
		}
	}

	// Shape 2: flat fields like { standard_remaining, reasoning_remaining, ... }
	for (const [key, val] of Object.entries(d)) {
		if (key === "categories") continue;
		if (typeof val === "number" && key.includes("remaining")) {
			const label = key.replace(/_remaining$/, "").replace(/_/g, " ");
			parts.push(`${label}: ${val} remaining`);
		}
	}

	// Shape 3: { message_cap, messages_remaining, reset_at }
	if (d.message_cap != null && d.messages_remaining != null) {
		parts.push(`messages: ${Number(d.message_cap) - Number(d.messages_remaining)}/${d.message_cap}`);
	}

	if (parts.length === 0) {
		return "usage unavailable (see /usage raw)";
	}
	return parts.join(" · ");
}

async function fetchCodexUsage(provider: string): Promise<CodexUsageInfo | null> {
	const token = readAuthToken(provider);
	if (!token) return null;

	try {
		const res = await fetch("https://chatgpt.com/backend-api/wham/usage", {
			headers: {
				Authorization: `Bearer ${token}`,
				"User-Agent": "Pi-CodingAgent/1.0",
			},
			signal: AbortSignal.timeout(10_000),
		});

		if (!res.ok) {
			return {
				provider,
				raw: { error: `HTTP ${res.status}` },
				timestamp: Date.now(),
				summary: `HTTP ${res.status}`,
			};
		}

		const data = await res.json();
		return {
			provider,
			raw: data,
			timestamp: Date.now(),
			summary: parseCodexUsageSummary(data),
		};
	} catch (err) {
		return {
			provider,
			raw: { error: String(err) },
			timestamp: Date.now(),
			summary: `fetch error`,
		};
	}
}

// ─── Auto-compaction ─────────────────────────────────────────────────────────

/** Compact when context exceeds this many tokens, regardless of model's native window. */
const AUTOCOMPACT_THRESHOLD = 150_000;

// ─── Extension ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	const state: UsageState = {
		rateLimits: new Map(),
		codexUsage: new Map(),
	};

	let pollTimer: ReturnType<typeof setInterval> | undefined;
	let lastActiveProvider: string | undefined;
	// Observations are model-specific, not inferred percentages or permanent account state.
	const subscriptionBlocked = new Set<string>();
	const directSubscriptions = new Set<string>();
	function refreshSubscriptionMetadata() {
		directSubscriptions.clear();
		for (const provider of ["openai", "openai-2"]) {
			if (isDirectSubscription(provider)) directSubscriptions.add(provider);
		}
	}

	pi.on("message_end", (event, ctx) => {
		const message = event.message;
		if (message.role !== "assistant" || !directSubscriptions.has(message.provider)) return;
		const key = `${message.provider}/${message.model}`;
		if (message.errorMessage?.includes("subscription_sharing_usage_limit_exceeded")) {
			subscriptionBlocked.add(key);
		} else if (message.stopReason !== "error" && message.stopReason !== "aborted") {
			subscriptionBlocked.delete(key);
		}
		updateStatus(ctx);
	});

	// ─── Universal auto-compaction at fixed token threshold ─────────────
	// Works for every model without per-model config in models.json.

	pi.on("turn_end", (_event, ctx) => {
		const usage = ctx.getContextUsage();
		if (!usage || usage.tokens == null) return;

		if (usage.tokens > AUTOCOMPACT_THRESHOLD) {
			const tokK = (usage.tokens / 1000).toFixed(0);
			const threshK = (AUTOCOMPACT_THRESHOLD / 1000).toFixed(0);
			ctx.ui.notify(`Context ${tokK}k exceeds ${threshK}k — auto-compacting…`, "info");
			ctx.compact();
		}
	});

	// ─── Capture rate-limit headers from API responses ───────────────────

	pi.on("after_provider_response", (event, ctx) => {
		const h = event.headers;
		if (!h) return;

		// Only process if we got rate-limit headers
		const hasRateLimitHeaders =
			h["x-ratelimit-limit-requests"] ||
			h["x-ratelimit-remaining-requests"] ||
			h["x-ratelimit-limit-tokens"] ||
			h["x-ratelimit-remaining-tokens"];

		if (!hasRateLimitHeaders) return;

		const provider = ctx.model?.provider || "unknown";
		const info: RateLimitInfo = {
			provider,
			limitRequests: parseNum(h["x-ratelimit-limit-requests"]),
			remainingRequests: parseNum(h["x-ratelimit-remaining-requests"]),
			limitTokens: parseNum(h["x-ratelimit-limit-tokens"]),
			remainingTokens: parseNum(h["x-ratelimit-remaining-tokens"]),
			resetRequests: h["x-ratelimit-reset-requests"] ?? null,
			resetTokens: h["x-ratelimit-reset-tokens"] ?? null,
			timestamp: Date.now(),
		};

		state.rateLimits.set(provider, info);
		lastActiveProvider = provider;
		updateStatus(ctx);
	});

	// ─── Poll Codex usage on model select & periodically ─────────────────

	async function pollCodexProviders(ctx: ExtensionContext) {
		// Find all codex providers
		let codexProviders = ["openai-codex"];
		try {
			const auth = JSON.parse(readFileSync(join(getAgentDir(), "auth.json"), "utf8"));
			codexProviders = Object.keys(auth).filter(key => /^openai-codex(?:-([2-9]|[1-9]\d+))?$/.test(key));
		} catch { /* No stored credentials available. */ }

		for (const provider of codexProviders) {
			const usage = await fetchCodexUsage(provider);
			if (usage) {
				state.codexUsage.set(provider, usage);
			}
		}

		updateStatus(ctx);
	}

	function updateStatus(ctx: ExtensionContext) {
		const provider = ctx.model?.provider || lastActiveProvider;
		if (!provider) {
			ctx.ui.setStatus("usage-limits", undefined);
			return;
		}

		const parts: string[] = [];
		const usage = ctx.getContextUsage();
		if (usage?.tokens != null) {
			parts.push(`ctx ${fmtNum(usage.tokens)}/${fmtNum(AUTOCOMPACT_THRESHOLD)}`);
		}

		if (directSubscriptions.has(provider)) {
			const key = `${provider}/${ctx.model?.id}`;
			parts.push(subscriptionBlocked.has(key)
				? "subscription: last request hit quota"
				: "subscription: remaining quota unknown");
		}

		// Show rate limits if available for current provider
		const rl = state.rateLimits.get(provider);
		if (rl) {
			const age = Math.round((Date.now() - rl.timestamp) / 1000);
			if (age < 300) { // Only show if less than 5 minutes old
				if (rl.remainingRequests != null && rl.limitRequests != null) {
					parts.push(`RPM:${rl.remainingRequests}/${fmtNum(rl.limitRequests)}`);
				}
				if (rl.remainingTokens != null && rl.limitTokens != null) {
					parts.push(`TPM:${fmtNum(rl.remainingTokens)}/${fmtNum(rl.limitTokens)}`);
				}
			}
		}

		// Show codex usage if available
		const cu = state.codexUsage.get(provider);
		if (cu) {
			const age = Math.round((Date.now() - cu.timestamp) / 1000);
			if (age < 600) { // Show if less than 10 minutes old
				parts.push(cu.summary);
			}
		}

		if (parts.length > 0) {
			ctx.ui.setStatus("usage-limits", `⚡ ${parts.join(" │ ")}`);
		} else {
			ctx.ui.setStatus("usage-limits", undefined);
		}
	}

	// ─── Session lifecycle ───────────────────────────────────────────────

	pi.on("session_start", (_event, ctx) => {
		refreshSubscriptionMetadata();
		// Remove any widget left by the earlier version; use only the footer.
		if (ctx.mode === "tui") ctx.ui.setWidget("usage-limits", undefined);
		updateStatus(ctx);
		// Initial poll for codex usage
		void pollCodexProviders(ctx);

		// Poll every 3 minutes
		pollTimer = setInterval(() => void pollCodexProviders(ctx), 3 * 60 * 1000);
	});

	pi.on("session_shutdown", () => {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = undefined;
		}
	});

	// Refresh codex usage on model change
	pi.on("model_select", (_event, ctx) => {
		refreshSubscriptionMetadata();
		lastActiveProvider = ctx.model?.provider;
		updateStatus(ctx);
		void pollCodexProviders(ctx);
	});

	// ─── /usage command ──────────────────────────────────────────────────

	pi.registerCommand("usage", {
		description: "Show current usage limits for all providers",
		handler: async (args, ctx) => {
			refreshSubscriptionMetadata();
			const refresh = args.trim() === "refresh";

			if (refresh) {
				ctx.ui.notify("Refreshing usage data…", "info");
				await pollCodexProviders(ctx);
			}

			const lines: string[] = [];
			const theme = ctx.ui.theme;

			lines.push(theme.fg("accent", "═══ Usage Limits ═══"));
			lines.push("");

			if (directSubscriptions.size > 0) {
				lines.push(theme.fg("accent", "OpenAI subscription sharing (Responses API)"));
				for (const provider of directSubscriptions) {
					const blocked = [...subscriptionBlocked].filter(key => key.startsWith(`${provider}/`));
					lines.push(`  ${provider}: remaining quota unknown (no verified polling endpoint)`);
					for (const key of blocked) lines.push(`    ${key}: last request hit subscription quota`);
				}
				lines.push("  Check allowance/reset details: https://chatgpt.com/settings/usage");
				lines.push("  RPM/TPM headers are API rate limits, not subscription allowance.");
				lines.push("");
			}

			// Rate limits from API headers
			if (state.rateLimits.size > 0) {
				lines.push(theme.fg("accent", "API Rate Limits") + theme.fg("dim", " (from response headers)"));
				lines.push("");

				for (const [provider, rl] of state.rateLimits) {
					const age = Math.round((Date.now() - rl.timestamp) / 1000);
					const ageStr = age < 60 ? `${age}s ago` : `${Math.round(age / 60)}m ago`;
					const isCurrent = provider === ctx.model?.provider;

					lines.push(
						`  ${isCurrent ? theme.fg("accent", "▸") : " "} ${theme.fg("text", provider)} ${theme.fg("dim", `(${ageStr})`)}`
					);

					if (rl.limitRequests != null) {
						const usedReq = rl.limitRequests - (rl.remainingRequests ?? 0);
						const bar = pctBar(usedReq, rl.limitRequests, 15);
						lines.push(
							`    Requests: ${bar} ${fmtNum(rl.remainingRequests)}/${fmtNum(rl.limitRequests)} remaining` +
								(rl.resetRequests ? theme.fg("dim", ` resets in ${rl.resetRequests}`) : "")
						);
					}

					if (rl.limitTokens != null) {
						const usedTok = rl.limitTokens - (rl.remainingTokens ?? 0);
						const bar = pctBar(usedTok, rl.limitTokens, 15);
						lines.push(
							`    Tokens:   ${bar} ${fmtNum(rl.remainingTokens)}/${fmtNum(rl.limitTokens)} remaining` +
								(rl.resetTokens ? theme.fg("dim", ` resets in ${rl.resetTokens}`) : "")
						);
					}
					lines.push("");
				}
			}

			// Codex/ChatGPT usage
			if (state.codexUsage.size > 0) {
				lines.push(theme.fg("accent", "ChatGPT/Codex Subscription Usage"));
				lines.push("");

				for (const [provider, cu] of state.codexUsage) {
					const age = Math.round((Date.now() - cu.timestamp) / 1000);
					const ageStr = age < 60 ? `${age}s ago` : `${Math.round(age / 60)}m ago`;
					const isCurrent = provider === ctx.model?.provider;

					lines.push(
						`  ${isCurrent ? theme.fg("accent", "▸") : " "} ${theme.fg("text", provider)} ${theme.fg("dim", `(${ageStr})`)}`
					);
					lines.push(`    ${cu.summary}`);

					// Show raw data in detail
					if (args.trim() === "raw" || args.trim() === "detail") {
						lines.push(theme.fg("dim", `    Raw: ${JSON.stringify(cu.raw, null, 2).split("\n").join("\n    ")}`));
					}
					lines.push("");
				}
			}

			if (state.rateLimits.size === 0 && state.codexUsage.size === 0 && directSubscriptions.size === 0) {
				lines.push(theme.fg("dim", "  No usage data available yet."));
				lines.push(theme.fg("dim", "  Send a message to capture rate limits, or run /usage refresh."));
				lines.push("");
			}

			lines.push(theme.fg("dim", "Commands: /usage refresh · /usage raw"));

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// Refresh the footer after each turn; no above-editor widget.
	pi.on("turn_end", (_event, ctx) => updateStatus(ctx));
}
