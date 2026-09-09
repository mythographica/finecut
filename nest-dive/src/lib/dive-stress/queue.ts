/**
 * Random queue consumer for dive stress test.
 *
 * Picks instances from the global registry and randomly:
 *   - processes them successfully
 *   - throws sync errors (→ uncaughtException)
 *   - rejects async (→ unhandledRejection)
 *   - attempts nested construction (→ creationError → uncaughtException)
 *
 * All failures self-pin their instance as they cross a dive wrap() boundary,
 * so the DLQ handler can trace back to the original request via
 * getErrorInstance — no manual error enrichment needed.
 */
import { wrap } from '@mnemonica/dive';
import { pickRandom } from './registry.js';

function randomId () : string {
	return Math.random().toString(36).slice(2, 10);
}

/**
 * Start the random consumer. Runs until registry is empty.
 * Processing interval: 80-250ms (randomized per tick).
 */
export function startConsumer () : void {
	function tick () {
		const instance = pickRandom();
		if (!instance) {
			// Registry empty — stop
			return;
		}

		// Schedule next tick FIRST so queue continues even if we throw.
		const delay = 80 + Math.floor(Math.random() * 170);
		setTimeout(tick, delay);

		const inst = instance as Record<string, unknown>;
		const uuid = String(inst.uuid || randomId());
		const requestId = String(inst.requestId || 'unknown');
		const dice = Math.random();

		if (dice < 0.55) {
			// ── SUCCESS PATH ──
			// eslint-disable-next-line no-console
			console.log(`[queue] OK    ${uuid.slice(0, 12)}  req=${requestId.slice(0, 8)}...`);
		} else if (dice < 0.72) {
			// ── SYNC THROW → uncaughtException ──
			// tick runs at an unwrapped boundary (setTimeout), so wrap the throw:
			// the error self-pins the instance as it crosses the wrap() edge.
			const throwSync = wrap(() => {
				throw new Error(`sync throw: ${uuid}`);
			}, instance);
			throwSync();
		} else if (dice < 0.86) {
			// ── ASYNC REJECTION → unhandledRejection ──
			// The rejecting promise crosses a wrap() edge, pinning the instance;
			// the derived promise is deliberately left unhandled.
			const rejectAsync = wrap(() => {
				const err = new Error(`async rejection: ${uuid}`);
				const rejection = Promise.reject(err);
				return rejection;
			}, instance);
			rejectAsync();
		} else {
			// ── NESTED CONSTRUCTION → creationError → uncaughtException ──
			const childCtor = inst.StressChild;
			if (typeof childCtor === 'function') {
				// dive's creationError hook pins the error to the parent instance;
				// the wrap() edge pins it again as it escapes — DLQ can trace back.
				const constructChild = wrap(() => {
					const child = new (childCtor as new (data: unknown) => object)({ forceError: true });
					return child;
				}, instance);
				constructChild();
			} else {
				// Fallback: plain throw if no child constructor
				const throwNoCtor = wrap(() => {
					throw new Error(`no child ctor: ${uuid}`);
				}, instance);
				throwNoCtor();
			}
		}
	}

	// Start with initial delay
	setTimeout(tick, 100);
}
