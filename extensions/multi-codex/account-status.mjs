// Local display only: no token refresh, network request or credential writes.
const isCodex = provider => /^openai-codex(?:-[2-9]|-[1-9]\d+)?$/.test(provider ?? '');
function claims(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); }
  catch { return {}; }
}
export function accountEmail(credential) {
  if (credential?.type !== 'oauth') return undefined;
  for (const token of [credential.access, credential.idToken, credential.id_token]) {
    if (typeof token !== 'string') continue;
    const payload = claims(token);
    const email = payload['https://api.openai.com/profile']?.email ?? payload.email;
    // Never display controls, escape sequences, whitespace or arbitrary claims.
    if (typeof email === 'string' && email.length <= 254 && /^[^\s\x00-\x1f\x7f@]+@[^\s\x00-\x1f\x7f@]+\.[^\s\x00-\x1f\x7f@]+$/.test(email)) return email;
  }
  return undefined;
}
export function installAccountStatus(pi, readCredentials) {
  let routedProvider;
  function show(ctx, physicalProvider) {
    const selected = ctx.model?.provider;
    if (selected === 'codex-auto' && isCodex(physicalProvider)) routedProvider = physicalProvider;
    const provider = selected === 'codex-auto' ? routedProvider : selected;
    if (selected !== 'codex-auto' && !isCodex(selected)) {
      routedProvider = undefined;
      ctx.ui.setStatus('codex-account', undefined);
      return;
    }
    let email;
    try { email = accountEmail(readCredentials()?.[provider]); } catch { /* unavailable */ }
    ctx.ui.setStatus('codex-account', email ? `Codex: ${email}` :
      (provider ? 'Codex: email unavailable' : 'Codex: account pending'));
  }
  pi.on('session_start', (_event, ctx) => {
    routedProvider = undefined;
    // Restore only the latest physical assistant on the current branch.
    if (ctx.model?.provider === 'codex-auto') {
      const entries = ctx.sessionManager.getBranch();
      for (let i = entries.length - 1; i >= 0; i--) {
        const msg = entries[i].message;
        if (msg?.role !== 'assistant') continue;
        if (isCodex(msg.provider) && msg.model === ctx.model.id) routedProvider = msg.provider;
        break;
      }
    }
    show(ctx);
  });
  pi.on('model_select', (_event, ctx) => { routedProvider = undefined; show(ctx); });
  for (const event of ['message_start', 'message_end']) {
    pi.on(event, (event, ctx) => {
      if (event.message?.role === 'assistant') show(ctx, event.message.provider);
    });
  }
  pi.on('session_shutdown', (_event, ctx) => { routedProvider = undefined; ctx.ui.setStatus('codex-account', undefined); });
}
