// Usage-aware selection only: never launch or retry a job from this module.
export const AUTO_PROVIDER = 'codex-auto';
export const AUTO_MODELS = ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna'];
export const CODEX_SLOTS = ['openai-codex', 'openai-codex-2', 'openai-codex-3'];
export const CACHE_MS = 60_000;
export const RESERVE_PERCENT = 5;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// WHAM is not a stable public API. Unknown/malformed windows are ineligible;
// reset timestamps never imply an allowance without a fresh server observation.
function remainingInLimit(limit, now) {
  if (!object(limit)) return null;
  if (limit.allowed === false || limit.limit_reached === true) return 0;
  if (limit.allowed !== true || limit.limit_reached !== false) return null;
  const values = [];
  for (const key of ['primary_window', 'secondary_window']) {
    const window = limit[key];
    if (window == null) continue;
    if (!object(window) || typeof window.used_percent !== 'number'
        || !Number.isFinite(window.used_percent) || window.used_percent < 0 || window.used_percent > 100) return null;
    if (window.reset_at != null && (typeof window.reset_at !== 'number'
        || !Number.isFinite(window.reset_at) || window.reset_at * 1000 <= now)) return null;
    values.push(100 - window.used_percent);
  }
  return values.length ? Math.min(...values) : null;
}
export function parseRemaining(data, now = Date.now()) {
  if (!object(data)) return null;
  const remaining = remainingInLimit(data.rate_limit, now);
  if (remaining === null) return null;
  const values = [remaining];
  // Conservatively include ALL reported additional limits. We do not infer a
  // model-to-limit mapping or assume shared allowance implies Astra entitlement.
  if (data.additional_rate_limits != null) {
    if (!Array.isArray(data.additional_rate_limits)) return null;
    for (const entry of data.additional_rate_limits) {
      const extra = remainingInLimit(entry?.rate_limit, now);
      if (extra === null) return null;
      values.push(extra);
    }
  }
  return Math.min(...values);
}
export function chooseAccount(observations, reserve = RESERVE_PERCENT) {
  const eligible = observations.filter(item => CODEX_SLOTS.includes(item.provider)
    && typeof item.remaining === 'number' && Number.isFinite(item.remaining)
    && item.remaining > reserve && item.remaining <= 100);
  eligible.sort((a, b) => b.remaining - a.remaining
    || CODEX_SLOTS.indexOf(a.provider) - CODEX_SLOTS.indexOf(b.provider));
  return eligible[0];
}
export function accountIdFromToken(token) {
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    const id = claims['https://api.openai.com/auth']?.chatgpt_account_id;
    return typeof id === 'string' && id ? id : undefined;
  } catch { return undefined; }
}

export function createQuotaService({ readCredentials, fetchImpl = fetch, now = Date.now }) {
  const cache = new Map();
  const pending = new Map();
  function accounts() {
    const credentials = readCredentials();
    const seen = new Set();
    return CODEX_SLOTS.flatMap(provider => {
      const credential = credentials?.[provider];
      if (credential?.type !== 'oauth' || typeof credential.access !== 'string'
          || typeof credential.accountId !== 'string' || !credential.accountId
          || accountIdFromToken(credential.access) !== credential.accountId
          || seen.has(credential.accountId)) return [];
      seen.add(credential.accountId);
      return [{ provider, accountId: credential.accountId }];
    });
  }
  async function observe(account, registry, force) {
    const key = `${account.provider}:${account.accountId}`;
    const cached = cache.get(key);
    if (!force && cached && now() - cached.timestamp < CACHE_MS) return cached;
    if (pending.has(key)) return pending.get(key);
    const operation = (async () => {
      let remaining = null, status;
      try {
        // Native auth owns token refresh and persistence; never rewrite auth.json.
        const resolution = await registry.getProviderAuth(account.provider);
        const auth = resolution?.auth;
        if (!auth?.apiKey || accountIdFromToken(auth.apiKey) !== account.accountId) {
          status = 'authentication unavailable';
        } else {
          const response = await fetchImpl('https://chatgpt.com/backend-api/wham/usage', {
            headers: { Authorization: `Bearer ${auth.apiKey}`, 'ChatGPT-Account-Id': account.accountId,
              'User-Agent': 'Pi-CodingAgent/1.0' },
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) status = `HTTP ${response.status}`;
          else {
            remaining = parseRemaining(await response.json(), now());
            status = remaining === null ? 'usage shape unavailable' : 'observed';
          }
        }
      } catch { status = 'usage request failed'; }
      // Only sanitized selection data escapes the service: no tokens, account IDs or raw payloads.
      const result = { provider: account.provider, remaining, status, timestamp: now() };
      cache.set(key, result);
      return result;
    })();
    pending.set(key, operation);
    try { return await operation; } finally { pending.delete(key); }
  }
  return {
    async observations(registry, { force = false, modelId, signal } = {}) {
      signal?.throwIfAborted();
      const candidates = accounts().filter(account => !modelId || registry.find(account.provider, modelId));
      const results = await Promise.all(candidates.map(account => observe(account, registry, force)));
      signal?.throwIfAborted();
      return results;
    },
  };
}

export async function routeCodex(request, registry, service) {
  const id = request.model.id;
  if (!AUTO_MODELS.includes(id)) throw new Error('Unsupported automatic Codex model');
  request.signal?.throwIfAborted();
  // No automatic account fallback after a failed provider call; no replay of
  // partial outputs or tools. Keep tool continuations on the same account too.
  const sticky = request.reason === 'retry' ? request.failed : request.reason === 'continuation'
    ? request.previous ?? (request.state?.provider ? { model: { provider: request.state.provider, id: request.state.modelId } } : undefined)
    : undefined;
  if (sticky) {
    if (!CODEX_SLOTS.includes(sticky.model.provider) || sticky.model.id !== id)
      throw new Error('Automatic Codex route identity changed; refusing continuation');
    const model = registry.find(sticky.model.provider, id);
    if (!model) throw new Error('Pinned Codex model unavailable');
    return { model, thinkingLevel: sticky.thinkingLevel ?? request.thinkingLevel, state: request.state };
  }
  // Routing errors have no failed physical model. Retry them closed rather than
  // polling or silently falling back to an unchecked account.
  if (request.reason === 'retry') throw new Error('Automatic Codex routing failed; refresh /codex-auto-status before an explicit retry');
  const observations = await service.observations(registry, { modelId: id, signal: request.signal });
  const selected = chooseAccount(observations);
  if (!selected) throw new Error(`No verified Codex slot 1–3 above ${RESERVE_PERCENT}% remaining. Run /codex-auto-status refresh; no fallback or model downgrade.`);
  const model = registry.find(selected.provider, id);
  if (!model) throw new Error('Selected Codex model unavailable');
  // Preserve the account across compaction, which may remove the last physical response.
  const state = request.state?.provider === selected.provider && request.state?.modelId === id
    ? request.state : { provider: selected.provider, modelId: id };
  return { model, thinkingLevel: request.thinkingLevel, state };
}

export function registerCodexRouter(pi, native, service) {
  for (const id of AUTO_MODELS) {
    const model = (native.getAllModels?.() ?? native.getModels()).find(model => model.id === id);
    if (!model) continue;
    pi.registerVirtualModel({
      provider: AUTO_PROVIDER, id, name: `Codex Auto · ${model.name ?? id}`,
      thinkingLevels: model.thinkingLevels ?? ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
      contextWindow: model.contextWindow, maxTokens: Math.min(model.maxTokens || 32_000, 32_000), input: model.input,
      route: (request, ctx) => routeCodex(request, ctx.modelRegistry, service),
    });
  }
  pi.registerCommand('codex-auto-status', {
    description: 'Show automatic Codex quota selection; add refresh to bypass the 60-second cache',
    async handler(args, ctx) {
      if (!['', 'refresh'].includes(args.trim())) { ctx.ui.notify('Usage: /codex-auto-status [refresh]', 'warning'); return; }
      const observations = await service.observations(ctx.modelRegistry, { force: args.trim() === 'refresh' });
      const selected = chooseAccount(observations);
      const lines = observations.map(item => `${item.provider}: ${item.remaining === null ? item.status : `${item.remaining}% conservative remaining`}`);
      lines.push(selected ? `Best quota: ${selected.provider} (model availability is checked at dispatch).`
        : 'No eligible account with verified quota. Sign into separate Codex accounts or wait for reset.');
      lines.push('New turns select by quota; continuations/retries stay pinned. No automatic job relaunch.');
      ctx.ui.notify(lines.join('\n'), 'info');
    },
  });
}
