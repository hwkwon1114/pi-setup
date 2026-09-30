import type {
  AssistantMessage,
  AssistantMessageEvent,
  AssistantMessageEventStream,
  Model,
  Provider,
  SimpleStreamOptions,
  TranscriptContext,
} from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const NATIVE_PROVIDER_ID = "openai";
export const OPENAI_ALIAS_PATTERN = /^openai-([2-9]|[1-9]\d+)$/;

export interface OAuthCredential {
  type: "oauth";
  access: string;
  refresh: string;
  expires: number;
  clientId?: string;
  scopes?: string[];
}

export interface AccountMetadata {
  sub?: string;
  email?: string;
  name?: string;
  expiresAt?: number;
  authenticated: boolean;
}

export interface MultiOpenAIOptions {
  native?: Provider<any>;
  agentDir?: string;
  fetchFn?: typeof fetch;
}

export function slotForProvider(providerId: string | undefined): number | undefined {
  if (!providerId) return undefined;
  if (providerId === NATIVE_PROVIDER_ID) return 1;
  const match = OPENAI_ALIAS_PATTERN.exec(providerId);
  return match ? Number(match[1]) : undefined;
}

export function providerForSlot(slot: number): string {
  return slot === 1 ? NATIVE_PROVIDER_ID : `${NATIVE_PROVIDER_ID}-${slot}`;
}

export function isManagedProvider(providerId: string | undefined): boolean {
  return slotForProvider(providerId) !== undefined;
}

export function isOAuthCredential(val: unknown): val is OAuthCredential {
  return (
    typeof val === "object" &&
    val !== null &&
    (val as Record<string, unknown>).type === "oauth" &&
    typeof (val as Record<string, unknown>).access === "string" &&
    typeof (val as Record<string, unknown>).refresh === "string"
  );
}

export function getAgentDir(): string {
  const envDir = process.env.PI_CODING_AGENT_DIR;
  if (envDir) return envDir;
  return join(process.env.HOME || homedir(), ".pi", "agent");
}

export function readCredentials(customAgentDir?: string): Map<number, OAuthCredential> {
  const credentials = new Map<number, OAuthCredential>();
  try {
    const authPath = join(customAgentDir || getAgentDir(), "auth.json");
    const raw = JSON.parse(readFileSync(authPath, "utf8"));
    if (typeof raw !== "object" || raw === null) return credentials;

    for (const [key, val] of Object.entries(raw)) {
      const slot = slotForProvider(key);
      if (slot && isOAuthCredential(val)) {
        credentials.set(slot, val);
      }
    }
  } catch {
    // auth.json may not exist yet or may be empty
  }
  return credentials;
}

export function parseJwtPayload(token: string): Record<string, unknown> | undefined {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return undefined;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "expired";
  const minutes = Math.ceil(ms / 60_000);
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const mins = minutes % 60;
  return [days ? `${days}d` : "", hours ? `${hours}h` : "", mins || (!days && !hours) ? `${mins}m` : ""].filter(Boolean).join(" ");
}

export function nativeModel(model: Model<any>): Model<any> {
  return model.provider === NATIVE_PROVIDER_ID ? model : { ...model, provider: NATIVE_PROVIDER_ID };
}

export function nativeContext(context: TranscriptContext): TranscriptContext {
  return {
    ...context,
    messages: context.messages.map((message) => {
      if (message.role !== "assistant") return message;
      if (OPENAI_ALIAS_PATTERN.test(message.provider)) {
        const rewritten = { ...message, provider: NATIVE_PROVIDER_ID };
        if (message.deferred) rewritten.deferred = { ...message.deferred, provider: NATIVE_PROVIDER_ID };
        return rewritten;
      }
      return message;
    }),
  };
}

export function aliasMessage(message: AssistantMessage, provider: string): AssistantMessage {
  const aliased = { ...message, provider };
  if (message.deferred) aliased.deferred = { ...message.deferred, provider };
  return aliased;
}

export function aliasEvent(event: AssistantMessageEvent, provider: string): AssistantMessageEvent {
  if (event.type === "done") return { ...event, message: aliasMessage(event.message, provider) };
  if (event.type === "error") return { ...event, error: aliasMessage(event.error, provider) };
  return { ...event, partial: aliasMessage(event.partial, provider) };
}

export class LocalAssistantMessageEventStream implements AssistantMessageEventStream {
  private queue: AssistantMessageEvent[] = [];
  private waiting: ((val: IteratorResult<AssistantMessageEvent>) => void)[] = [];
  private done = false;
  private resolveResult!: (msg: AssistantMessage) => void;
  private resultPromise = new Promise<AssistantMessage>((resolve) => {
    this.resolveResult = resolve;
  });

  push(event: AssistantMessageEvent): void {
    if (this.done) return;
    if (event.type === "done") {
      this.done = true;
      this.resolveResult(event.message);
    } else if (event.type === "error") {
      this.done = true;
      this.resolveResult(event.error);
    }
    const waiter = this.waiting.shift();
    if (waiter) {
      waiter({ value: event, done: false });
    } else {
      this.queue.push(event);
    }
  }

  end(): void {
    this.done = true;
    while (this.waiting.length > 0) {
      this.waiting.shift()!({ value: undefined as any, done: true });
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<AssistantMessageEvent> {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
      } else if (this.done) {
        return;
      } else {
        const item = await new Promise<IteratorResult<AssistantMessageEvent>>((resolve) =>
          this.waiting.push(resolve),
        );
        if (item.done) return;
        yield item.value;
      }
    }
  }

  result(): Promise<AssistantMessage> {
    return this.resultPromise;
  }
}

export function createAssistantMessageEventStream(): AssistantMessageEventStream {
  return new LocalAssistantMessageEventStream();
}

export function isRateLimitError(status?: number, errorMessage?: string): boolean {
  if (status === 429) return true;
  if (!errorMessage) return false;
  const lower = errorMessage.toLowerCase();
  return (
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("too many requests") ||
    lower.includes("subscription_sharing_usage_limit_exceeded") ||
    lower.includes("subscription sharing usage limit")
  );
}

export function removeStoredCredential(agentDir: string | undefined, slot: number): boolean {
  const targetDir = agentDir || getAgentDir();
  const authPath = join(targetDir, "auth.json");
  if (!existsSync(authPath)) return false;
  try {
    const raw = JSON.parse(readFileSync(authPath, "utf8")) as Record<string, unknown>;
    const provider = providerForSlot(slot);
    if (provider in raw) {
      delete raw[provider];
      writeFileSync(authPath, JSON.stringify(raw, null, 2), { mode: 0o600 });
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function pickNextAvailableSlot(failedSlot: number, authenticatedSlots: number[]): number | undefined {
  const unique = [...new Set(authenticatedSlots)].sort((a, b) => a - b);
  if (unique.length <= 1) return undefined;
  const idx = unique.indexOf(failedSlot);
  if (idx === -1) {
    return unique[0];
  }
  const nextIdx = (idx + 1) % unique.length;
  return unique[nextIdx];
}

export function aliasStream(
  source: AssistantMessageEventStream,
  model: Model<any>,
  provider: string,
  onError?: (error: AssistantMessage) => void,
): AssistantMessageEventStream {
  const output = createAssistantMessageEventStream();
  void (async () => {
    try {
      for await (const event of source) {
        if (event.type === "error" && onError) {
          onError(event.error);
        }
        output.push(aliasEvent(event, provider));
      }
      output.end();
    } catch (error) {
      const errMessage: AssistantMessage = {
        role: "assistant",
        content: [],
        api: model.api,
        provider,
        model: model.id,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };
      if (onError) onError(errMessage);
      output.push({
        type: "error",
        reason: "error",
        error: errMessage,
      });
      output.end();
    }
  })();
  return output;
}

export function createOpenAIAliasProvider(
  native: Provider<any>,
  slot: number,
  onRateLimit?: (slot: number) => void,
): Provider<any> {
  const providerId = providerForSlot(slot);

  const provider: Provider<any> = {
    id: providerId,
    name: `OpenAI #${slot}`,
    baseUrl: native.baseUrl,
    headers: native.headers,
    auth: {
      oauth: {
        name: `OpenAI #${slot} (ChatGPT subscription)`,
        isSubscription: true,
        loginLabel: `Sign in with ChatGPT (Account #${slot})`,
        login: async (interaction, options) => {
          const wrappedInteraction = {
            ...interaction,
            notify: (notice: any) => {
              if (notice?.type === "auth_url" && slot > 1) {
                interaction.notify({
                  type: "info",
                  message: `Signing in to OpenAI Account #${slot}. If your browser is currently signed into Account #1, open the link in a Private/Incognito window or switch accounts in ChatGPT.`,
                });
              }
              return interaction.notify(notice);
            },
          };
          return await native.auth.oauth.login(wrappedInteraction, options);
        },
        refresh: async (credential, signal) => {
          return await native.auth.oauth.refresh(credential, signal);
        },
        toAuth: async (credential) => {
          return await native.auth.oauth.toAuth(credential);
        },
      },
    },
    getModels: () => native.getModels().map((m) => ({ ...m, provider: providerId })),
    getAllModels: () => (native.getAllModels?.() ?? native.getModels()).map((m) => ({ ...m, provider: providerId })),
    stream: (model, context, options) =>
      aliasStream(native.stream(nativeModel(model), nativeContext(context), options), model, providerId, (err) => {
        if (isRateLimitError(undefined, err.errorMessage)) {
          onRateLimit?.(slot);
        }
      }),
    streamSimple: (model, context, options: SimpleStreamOptions | undefined) =>
      aliasStream(native.streamSimple(nativeModel(model), nativeContext(context), options), model, providerId, (err) => {
        if (isRateLimitError(undefined, err.errorMessage)) {
          onRateLimit?.(slot);
        }
      }),
  };

  if (native.filterModels) {
    provider.filterModels = (available, credential) =>
      native.filterModels!(available.map(nativeModel), credential).map((m) => ({ ...m, provider: providerId }));
  }
  if (native.fetchDeferred) {
    provider.fetchDeferred = (model, handle, options) =>
      aliasStream(native.fetchDeferred!(nativeModel(model), { ...handle, provider: NATIVE_PROVIDER_ID }, options), model, providerId);
  }
  if (native.cancelDeferred) {
    provider.cancelDeferred = (model, handle, options) =>
      native.cancelDeferred!(nativeModel(model), { ...handle, provider: NATIVE_PROVIDER_ID }, options);
  }
  return provider;
}

export default async function multiOpenAI(pi: ExtensionAPI, opts?: MultiOpenAIOptions): Promise<void> {
  let native = opts?.native;
  if (!native) {
    try {
      const { builtinProviders } = await import("@earendil-works/pi-ai/providers/all");
      native = builtinProviders().find((p) => p.id === NATIVE_PROVIDER_ID);
    } catch {
      // Dynamic import unavailable (e.g. offline testing without global modules)
    }
  }
  if (!native) return;

  const agentDir = opts?.agentDir ?? getAgentDir();
  const effectiveFetch = opts?.fetchFn ?? fetch;

  const registeredSlots = new Map<number, Provider<any>>();
  const accountMetadataCache = new Map<number, AccountMetadata>();
  let providerRequest: { provider?: string; status?: number } | undefined;
  let lastRateLimitedSlot: number | undefined;
  const autoSwitchOn429 = true;

  function registerSlot(slot: number): void {
    if (slot === 1 || registeredSlots.has(slot)) return;
    const aliasProvider = createOpenAIAliasProvider(native!, slot, (s) => {
      lastRateLimitedSlot = s;
    });
    pi.registerProvider(aliasProvider);
    registeredSlots.set(slot, aliasProvider);
  }

  function syncSlots(): Set<number> {
    const credentials = readCredentials(agentDir);
    const activeSlots = new Set<number>(credentials.keys());

    // Invalidate cached metadata for any slot that is no longer authenticated
    for (const [slot, meta] of accountMetadataCache.entries()) {
      if (meta.authenticated && !credentials.has(slot)) {
        accountMetadataCache.set(slot, { authenticated: false });
      }
    }

    // Slot 2 is registered by default so it's always ready for /login or model selection
    registerSlot(2);

    for (const slot of activeSlots) {
      if (slot > 1) registerSlot(slot);
    }
    return activeSlots;
  }

  async function fetchAccountMetadata(slot: number, credential?: OAuthCredential): Promise<AccountMetadata> {
    if (!credential) {
      const unauth: AccountMetadata = { authenticated: false };
      accountMetadataCache.set(slot, unauth);
      return unauth;
    }

    const jwt = parseJwtPayload(credential.access);
    const sub = typeof jwt?.sub === "string" ? jwt.sub : undefined;
    const expiresAt = typeof credential.expires === "number" ? credential.expires : undefined;

    let email: string | undefined;
    let name: string | undefined;

    try {
      const res = await effectiveFetch("https://api.openai.com/v1/me", {
        headers: { Authorization: `Bearer ${credential.access}` },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        if (typeof data.email === "string") email = data.email;
        if (typeof data.name === "string") name = data.name;
      }
    } catch {
      const existing = accountMetadataCache.get(slot);
      if (existing?.email) email = existing.email;
      if (existing?.name) name = existing.name;
    }

    const meta: AccountMetadata = {
      sub,
      email,
      name,
      expiresAt,
      authenticated: true,
    };
    accountMetadataCache.set(slot, meta);
    return meta;
  }

  async function refreshAllMetadata(): Promise<void> {
    const credentials = readCredentials(agentDir);
    const slots = new Set([1, 2, ...credentials.keys(), ...registeredSlots.keys()]);
    await Promise.allSettled(
      [...slots].map(async (slot) => {
        await fetchAccountMetadata(slot, credentials.get(slot));
      }),
    );
  }

  function footerText(ctx: ExtensionContext): string | undefined {
    const model = ctx.model;
    if (!model) return undefined;
    const slot = slotForProvider(model.provider);
    if (!slot) return undefined;

    const meta = accountMetadataCache.get(slot);
    const prefix = `OpenAI #${slot}`;

    if (!meta || !meta.authenticated) {
      const text = `${prefix} · not logged in (/login ${providerForSlot(slot)})`;
      return ctx.ui?.theme?.fg ? ctx.ui.theme.fg("warning", text) : text;
    }

    const label = meta.email || (meta.sub ? `user-${meta.sub.slice(0, 8)}` : "authenticated");
    const text = `${prefix} · ${label}`;
    return ctx.ui?.theme?.fg ? ctx.ui.theme.fg("success", text) : text;
  }

  function updateFooter(ctx: ExtensionContext): void {
    if (ctx.hasUI && ctx.ui?.setStatus) {
      ctx.ui.setStatus("multi-openai", footerText(ctx));
    }
  }

  // Initial slot registration
  syncSlots();

  pi.on("session_start", async (_event, ctx) => {
    syncSlots();
    await refreshAllMetadata();
    updateFooter(ctx);

    // Check for duplicate accounts between slots 1 and 2
    const meta1 = accountMetadataCache.get(1);
    const meta2 = accountMetadataCache.get(2);
    if (meta1?.authenticated && meta2?.authenticated && meta1.sub && meta2.sub && meta1.sub === meta2.sub) {
      ctx.ui?.notify?.(
        "Notice: OpenAI Slot 1 and Slot 2 are signed in to the SAME ChatGPT account. To use two accounts, sign in to Slot 2 using a Private/Incognito window.",
        "warning",
      );
    }
  });

  pi.on("model_select", async (_event, ctx) => {
    syncSlots();
    await refreshAllMetadata();
    updateFooter(ctx);
  });

  pi.on("before_provider_request", (_event, ctx) => {
    providerRequest = { provider: ctx.model?.provider };
  });

  pi.on("after_provider_response", (event) => {
    if (providerRequest) providerRequest.status = event.status;
  });

  pi.on("message_end", async (event, ctx) => {
    const request = providerRequest;
    providerRequest = undefined;
    const streamRateLimitedSlot = lastRateLimitedSlot;
    lastRateLimitedSlot = undefined;

    if (!autoSwitchOn429) return;
    if (event.message.role !== "assistant" || event.message.stopReason !== "error") return;

    const errorMessage = event.message.errorMessage ?? "";
    const isRateLimit =
      request?.status === 429 ||
      streamRateLimitedSlot !== undefined ||
      isRateLimitError(request?.status, errorMessage);

    if (!isRateLimit) return;

    const model = ctx.model;
    if (!model) return;
    const failedSlot = streamRateLimitedSlot ?? slotForProvider(event.message.provider);
    if (!failedSlot || model.provider !== event.message.provider) return;

    const credentials = readCredentials(agentDir);
    const authenticatedSlots = [...credentials.keys()].sort((a, b) => a - b);
    if (authenticatedSlots.length <= 1) return;

    const nextSlot = pickNextAvailableSlot(failedSlot, authenticatedSlots);
    if (!nextSlot || nextSlot === failedSlot) return;

    const nextProvider = providerForSlot(nextSlot);
    const success = await pi.setModel({ ...model, provider: nextProvider });
    if (success) {
      ctx.ui?.notify?.(
        `OpenAI #${failedSlot} hit rate limits (HTTP 429). Automatically switched to OpenAI #${nextSlot} (${nextProvider}/${model.id}).`,
        "warning",
      );
      updateFooter(ctx);
    }
  });

  pi.registerCommand("openai-status", {
    description: "Show OpenAI / ChatGPT multi-account authentication status",
    handler: async (_args, ctx) => {
      syncSlots();
      await refreshAllMetadata();
      const credentials = readCredentials(agentDir);
      const allSlots = [...new Set([1, 2, ...credentials.keys(), ...registeredSlots.keys()])].sort((a, b) => a - b);

      const lines: string[] = ["OpenAI Multi-Account Status:"];
      const currentSlot = slotForProvider(ctx.model?.provider);

      for (const slot of allSlots) {
        const meta = accountMetadataCache.get(slot);
        const providerName = providerForSlot(slot);
        const isActive = currentSlot === slot;
        const activeMarker = isActive ? " [ACTIVE]" : "";

        if (meta && meta.authenticated) {
          const account = meta.email ? meta.email : (meta.sub ? `sub: ${meta.sub.slice(0, 16)}...` : "authenticated");
          const expires = meta.expiresAt ? `expires in ${formatDuration(meta.expiresAt - Date.now())}` : "active";
          lines.push(`  • Slot ${slot} (${providerName})${activeMarker}: ${account} (${expires})`);
        } else {
          lines.push(`  • Slot ${slot} (${providerName})${activeMarker}: Not signed in. Run: /login ${providerName}`);
        }
      }

      // Check duplicates
      const meta1 = accountMetadataCache.get(1);
      const meta2 = accountMetadataCache.get(2);
      if (meta1?.authenticated && meta2?.authenticated && meta1.sub && meta2.sub && meta1.sub === meta2.sub) {
        lines.push("\n⚠️ Warning: Slot 1 and Slot 2 are using the SAME ChatGPT account.");
        lines.push("To log into Account #2, open a Private/Incognito browser window and run: /login openai-2");
      }

      ctx.ui?.notify?.(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("openai-switch", {
    description: "Switch active model between OpenAI / ChatGPT account slots",
    handler: async (_args, ctx) => {
      const model = ctx.model;
      if (!model || !isManagedProvider(model.provider)) {
        ctx.ui?.notify?.("Current model is not an OpenAI model. Please select an OpenAI model first.", "warning");
        return;
      }

      syncSlots();
      const credentials = readCredentials(agentDir);
      const currentSlot = slotForProvider(model.provider) ?? 1;

      // Available slots that have credentials
      const available = [...credentials.keys()].sort((a, b) => a - b);
      if (available.length === 0) {
        ctx.ui?.notify?.("No authenticated OpenAI slots found. Run /login openai to sign in.", "warning");
        return;
      }

      let targetSlot: number;
      if (available.length === 1) {
        if (available[0] === currentSlot) {
          ctx.ui?.notify?.(
            `Only Slot ${currentSlot} is currently authenticated. Run /login ${providerForSlot(currentSlot === 1 ? 2 : 1)} to add another account.`,
            "warning",
          );
          return;
        }
        targetSlot = available[0];
      } else if (available.length === 2) {
        // Toggle between the two
        targetSlot = available[0] === currentSlot ? available[1] : available[0];
      } else {
        // Select from multiple
        const choices = available.map((s) => {
          const meta = accountMetadataCache.get(s);
          const email = meta?.email ? ` (${meta.email})` : "";
          return `OpenAI #${s}${email}`;
        });
        const selected = await ctx.ui?.select?.("Switch OpenAI Account Slot", choices);
        const index = selected ? choices.indexOf(selected) : -1;
        if (index < 0) return;
        targetSlot = available[index];
      }

      const nextProvider = providerForSlot(targetSlot);
      if (nextProvider !== model.provider) {
        await pi.setModel({ ...model, provider: nextProvider });
        const meta = accountMetadataCache.get(targetSlot);
        const label = meta?.email ? ` (${meta.email})` : "";
        ctx.ui?.notify?.(`Switched to OpenAI #${targetSlot}${label} (${nextProvider}/${model.id})`, "info");
        updateFooter(ctx);
      }
    },
  });

  pi.registerCommand("openai-add", {
    description: "Enroll an additional OpenAI / ChatGPT account slot (slot 3, 4, etc.)",
    handler: async (_args, ctx) => {
      const credentials = readCredentials(agentDir);
      const used = new Set([...credentials.keys(), ...registeredSlots.keys()]);
      let nextSlot = 2;
      while (used.has(nextSlot)) nextSlot++;

      registerSlot(nextSlot);
      const providerName = providerForSlot(nextSlot);
      ctx.ui?.notify?.(`OpenAI slot ${nextSlot} registered! Run /login ${providerName} to sign in with ChatGPT.`, "info");
    },
  });

  pi.registerCommand("openai-remove", {
    description: "Remove credentials for a slot or unenroll an added slot (e.g. /openai-remove 2 or /openai-remove 3)",
    handler: async (args, ctx) => {
      const rawArg = args.trim();
      let targetSlot: number | undefined;
      const match = rawArg.match(/(?:openai\s*[-_]?\s*)?(\d+)/i);
      if (match) {
        targetSlot = Number.parseInt(match[1], 10);
      } else if (!rawArg && ctx.model) {
        targetSlot = slotForProvider(ctx.model.provider);
      }

      if (!targetSlot || targetSlot < 2) {
        ctx.ui?.notify?.(
          "Usage: /openai-remove <slot-number> (e.g., /openai-remove 2 or /openai-remove 3). Primary slot 1 cannot be removed via this command; use /logout instead.",
          "warning",
        );
        return;
      }

      const removedAuth = removeStoredCredential(agentDir, targetSlot);
      accountMetadataCache.set(targetSlot, { authenticated: false });
      if (targetSlot > 2) {
        registeredSlots.delete(targetSlot);
      }

      if (ctx.model && slotForProvider(ctx.model.provider) === targetSlot) {
        ctx.setModel({ ...ctx.model, provider: "openai" });
      }

      updateFooter(ctx);

      const actionDesc = targetSlot > 2 ? "unenrolled and removed" : "logged out (credentials removed)";
      const detail = removedAuth ? "" : " (no stored credentials found in auth.json)";
      ctx.ui?.notify?.(
        `OpenAI #${targetSlot} (${providerForSlot(targetSlot)}) ${actionDesc}.${detail}`,
        "info",
      );
    },
  });
}
