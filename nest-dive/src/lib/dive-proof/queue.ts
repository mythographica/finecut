/**
 * Random-delay queue for the queue-attribution proof.
 *
 * Reproduces the 2016 incident shape: work arrives over HTTP, then sits in a
 * queue that picks items in RANDOM order and processes them after RANDOM
 * timer delays — so the outcome (ok or error) is decoupled from arrival
 * order, from the request/response cycle, and from any ambient context.
 *
 * The consumer catches process() failures itself (this is NOT the
 * process-level escape the load proof covers): the point is that even a
 * CAUGHT error still carries its own attribution.
 */
import { recordOk, recordFailure } from './store.js';
import type { ProofResult } from './types.js';

const pending : object[] = [];
let running = false;

export function enqueueProof (instance: object) : void {
	pending.push(instance);
	if (!running) {
		running = true;
		setTimeout(tick, 25);
	}
}

function tick () : void {
	// Random pick — processing order is shuffled against arrival order.
	const index = Math.floor(Math.random() * pending.length);
	const [instance] = pending.splice(index, 1);

	// Schedule the next tick FIRST so the queue drains even if processOne
	// throws synchronously (it should not — it awaits and catches).
	if (pending.length > 0) {
		setTimeout(tick, 5 + Math.floor(Math.random() * 15));
	} else {
		running = false;
	}

	void processOne(instance);
}

async function processOne (instance: object) : Promise<void> {
	const proc = (instance as { process : () => Promise<ProofResult> }).process;
	try {
		const result = await proc.call(instance);
		recordOk(result);
	} catch (err) {
		recordFailure(err);
	}
}
