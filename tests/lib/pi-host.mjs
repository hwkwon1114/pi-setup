// Shared Pi host resolution for offline extension tests (one place to follow Pi's extension-loader aliases).
// Not a test itself: run-tests.sh only collects test-*.mjs / test.mjs.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { createRequire } from 'node:module';

/** Pi host node_modules: PI_HOST_MODULES, else the newest managed install, else the global npm install. */
export function piModules() {
  if (process.env.PI_HOST_MODULES) return process.env.PI_HOST_MODULES;
  const home = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent');
  const rel = join(home, 'install', 'releases');
  const versions = existsSync(rel) ? readdirSync(rel).filter(v => existsSync(join(rel, v, 'node_modules', '@earendil-works', 'pi-coding-agent')))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
  if (versions.length) return join(rel, versions.at(-1), 'node_modules');
  return execFileSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim();
}

/**
 * Aliases mirroring Pi's extension loader (core/extensions/loader.js getAliases) for the modules our extensions import.
 * Pi >= 1.5 maps the pi-ai root to its extension view (pi-ai compat entry + TypeBox Type/StringEnum); older Pi used pi-ai's index.
 */
export function hostAliases(modules = piModules()) {
  const host = join(modules, '@earendil-works/pi-coding-agent');
  const dep = name => [join(host, 'node_modules', name), join(modules, name)].find(existsSync) ?? join(modules, name);
  const first = (...p) => p.find(existsSync) ?? p.at(-1);
  const piAi = dep('@earendil-works/pi-ai');
  return {
    '@earendil-works/pi-coding-agent': join(host, 'dist/index.js'),
    '@earendil-works/pi-ai/compat': first(join(host, 'dist/core/extensions/pi-ai-extension-view.js'), join(piAi, 'dist/compat.js'), join(piAi, 'dist/index.js')),
    '@earendil-works/pi-ai': first(join(host, 'dist/core/extensions/pi-ai-extension-view.js'), join(piAi, 'dist/index.js')),
    '@earendil-works/pi-tui': join(dep('@earendil-works/pi-tui'), 'dist/index.js'),
    'typebox': join(dep('typebox'), 'build/index.mjs'),
  };
}

/** jiti instance configured like Pi's extension loader; `extra` aliases override the defaults. */
export function hostJiti(importMetaUrl, extra = {}, modules = piModules()) {
  const { createJiti } = createRequire(join(modules, '@earendil-works/pi-coding-agent/package.json'))('jiti');
  return createJiti(importMetaUrl, { alias: { ...hostAliases(modules), ...extra } });
}
