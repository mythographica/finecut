/**
 * Queue-attribution proof — the 2016 incident, reconstructed.
 *
 * The claim under test: a request's identity survives a random-order,
 * random-delay queue. Requests arrive carrying a numeric marker and the
 * outcome they SHOULD produce (marker % 10 === 7 → 'fail', else 'ok').
 * The server constructs a ProofEntity per request, drops it into a queue
 * that picks items in RANDOM order and processes them after RANDOM timer
 * delays, and ends the HTTP exchange immediately. Later, the consumer reads
 * each outcome BY UUID and asserts:
 *
 *   - outcome.uuid   === the uuid this request was given
 *   - outcome.marker === the marker this request sent
 *   - outcome.status === the outcome the marker dictates ('error' ⇔ 'fail')
 *   - error outcomes carry a non-empty flow with an 'error'-status edge
 *
 * On failure the server NEVER uses the instance reference it holds — the
 * attribution is recovered from the error object alone (getErrorInstance).
 * If dive ever cross-pinned an error under interleaved load, a marker would
 * contradict its uuid here and the run would fail. Zero misattributions.
 *
 * Run: npm run proof:queue   (builds first; ~30s)
 */
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { AppModule } from '../build/src/app.module.js';

const TOTAL = 140;
const CONCURRENCY = 50;

const app = await NestFactory.create(AppModule, new FastifyAdapter(), {
	logger : false,
});
await app.init();
await app.listen(0, '127.0.0.1');
const address = app.getHttpAdapter().getInstance().server.address();
const base = `http://127.0.0.1:${address.port}`;

let failed = false;

try {
	// ── Fire TOTAL marker requests through a concurrency pool ────────────
	console.log(`queue proof: ${TOTAL} requests, ${CONCURRENCY} in flight, markers 1..${TOTAL}`);
	const sent = new Map(); // uuid → { marker, expect }
	let next = 0;

	async function worker () {
		while (next < TOTAL) {
			const marker = ++next;
			const expect = marker % 10 === 7 ? 'fail' : 'ok';
			const res = await fetch(`${base}/proof`, {
				method  : 'POST',
				headers : { 'content-type': 'application/json' },
				body    : JSON.stringify({ marker, expect }),
			});
			if (res.status !== 201 && res.status !== 200) {
				throw new Error(`POST /proof responded ${res.status}`);
			}
			const body = await res.json();
			sent.set(body.uuid, { marker, expect });
		}
	}
	await Promise.all(Array.from({ length: CONCURRENCY }, worker));
	console.log(`sent: ${sent.size} (${[...sent.values()].filter((v) => v.expect === 'fail').length} expected to fail)`);

	// ── Poll every outcome by uuid, in parallel ──────────────────────────
	async function pollOutcome (uuid) {
		for (let attempt = 0; attempt < 300; attempt++) {
			const res = await fetch(`${base}/proof/${uuid}`);
			if (res.status === 200) {
				const result = await res.json();
				return result;
			}
			await new Promise((resolve) => {
				setTimeout(resolve, 50);
			});
		}
		const result = undefined;
		return result;
	}

	let missing = 0;
	let misattributed = 0;
	let wrongStatus = 0;

	await Promise.all([...sent.entries()].map(async ([uuid, { marker, expect }]) => {
		const outcome = await pollOutcome(uuid);
		if (!outcome) {
			missing++;
			console.error(`MISSING outcome for ${uuid} (marker ${marker})`);
			return;
		}
		const expectedStatus = expect === 'fail' ? 'error' : 'ok';
		if (outcome.uuid !== uuid || outcome.marker !== marker) {
			misattributed++;
			console.error(`MISATTRIBUTION for ${uuid} (marker ${marker}):`, JSON.stringify(outcome));
			return;
		}
		if (outcome.status !== expectedStatus) {
			wrongStatus++;
			console.error(`WRONG STATUS for ${uuid} (marker ${marker}): expected ${expectedStatus}, got ${outcome.status}`);
			return;
		}
		if (expectedStatus === 'error') {
			const flowOk = Array.isArray(outcome.flow)
				&& outcome.flow.length > 0
				&& outcome.flow.some((edge) => edge.status === 'error');
			const messageOk = typeof outcome.errorMessage === 'string'
				&& outcome.errorMessage.includes(`marker ${marker}`);
			if (!flowOk || !messageOk) {
				misattributed++;
				console.error(`BROKEN ERROR BUNDLE for ${uuid} (marker ${marker}):`, JSON.stringify(outcome));
			}
		}
	}));

	// …and the process survived the whole queue
	const health = await fetch(`${base}/engine/health`);
	const alive = health.status === 200;

	console.log('---');
	console.log(`sent          : ${sent.size}`);
	console.log(`resolved      : ${sent.size - missing}`);
	console.log(`misattributed : ${misattributed}`);
	console.log(`wrong status  : ${wrongStatus}`);
	console.log(`server alive  : ${alive}`);

	if (missing > 0 || misattributed > 0 || wrongStatus > 0 || !alive) {
		failed = true;
		console.error('QUEUE PROOF FAILED');
	} else {
		console.log('QUEUE PROOF PASSED — request 42 stayed 42, all the trace through');
	}
} finally {
	await app.close();
}

process.exit(failed ? 1 : 0);
