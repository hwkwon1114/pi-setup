import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export const PI_WEB_SESSION_LIVENESS_REGISTRY_KEY = "@agegr/pi-web/session-liveness/v1";
const PI_WEB_SESSION_LIVENESS_PROTOCOL_VERSION = 1;

export interface LivenessRegistration {
	name: string;
	sessionId: string;
	sessionFile?: string;
	isActive: () => boolean;
}

interface LivenessRegistry {
	version: number;
	register: (registration: LivenessRegistration) => (() => void);
	isSessionActive?: (sessionId?: string) => boolean;
}

const activeRegistrations = new Set<LivenessRegistration>();

/** Ensure the session liveness protocol registry is available on globalThis */
export function ensureLivenessRegistry(): void {
	const key = Symbol.for(PI_WEB_SESSION_LIVENESS_REGISTRY_KEY);
	const target = globalThis as Record<symbol, unknown>;
	if (!target[key] || typeof target[key] !== "object") {
		const registry: LivenessRegistry = {
			version: PI_WEB_SESSION_LIVENESS_PROTOCOL_VERSION,
			register(registration: LivenessRegistration) {
				activeRegistrations.add(registration);
				return () => {
					activeRegistrations.delete(registration);
				};
			},
			isSessionActive(sessionId?: string): boolean {
				return checkRegisteredLiveness(sessionId);
			},
		};
		target[key] = registry;
	} else {
		const existing = target[key] as LivenessRegistry;
		if (typeof existing.register === "function" && !existing.isSessionActive) {
			const origRegister = existing.register.bind(existing);
			existing.register = (reg: LivenessRegistration) => {
				activeRegistrations.add(reg);
				const release = origRegister(reg);
				return () => {
					activeRegistrations.delete(reg);
					if (typeof release === "function") release();
				};
			};
			existing.isSessionActive = (sessionId?: string) => checkRegisteredLiveness(sessionId);
		}
	}
}

function checkRegisteredLiveness(sessionId?: string): boolean {
	for (const reg of activeRegistrations) {
		try {
			if (!sessionId || reg.sessionId === sessionId) {
				if (reg.isActive()) return true;
			}
		} catch {
			// Ignore stale provider errors
		}
	}
	return false;
}

/** Check disk active runs in temp directories as fallback */
function hasDiskActiveRuns(): boolean {
	try {
		const tmp = os.tmpdir();
		const entries = fs.readdirSync(tmp);
		for (const d of entries) {
			if (d.startsWith("pi-subagents-")) {
				const activeDir = path.join(tmp, d, "async-subagent-runs", ".active-runs");
				if (fs.existsSync(activeDir)) {
					const files = fs.readdirSync(activeDir, { withFileTypes: true });
					if (files.some(f => f.isFile())) return true;
				}
			}
		}
	} catch {
		// Ignore filesystem errors
	}
	return false;
}

/**
 * Check whether any background subagent, review, or asynchronous child work
 * is currently active. When true, goal continuation must not fire autonomous turns.
 */
export function isBackgroundWorkActive(ctx?: ExtensionContext): boolean {
	const sessionId = ctx?.sessionManager?.getSessionId?.();
	if (checkRegisteredLiveness(sessionId)) return true;
	if (hasDiskActiveRuns()) return true;
	return false;
}

// Install registry immediately when module is imported
ensureLivenessRegistry();
