/**
 * Load proof — context control under concurrent HTTP load.
 *
 * The claim under test: dive's context is pinned to DATA, not to async
 * resources, so concurrent interleaved requests can never read each other's
 * context — even at the REAL crash boundary (uncaughtException /
 * unhandledRejection), where ALS's ambient store is already gone.
 *
 * Phase A (autocannon, raw throughput): hammer a wrapped-work endpoint over
 *   real TCP — the server holds up under 50 concurrent connections.
 * Phase B (attribution proof): fire TOTAL unique-marker crash requests with
 *   a concurrency pool; every crash escapes to process level; then retrieve
 *   each report by uuid and assert the instance data carries EXACTLY the
 *   marker that request was sent with. Zero misattributions allowed.
 *
 * Run: npm run load:proof   (builds first; ~30s)
 */
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import autocannon from 'autocannon';
import { AppModule } from '../build/src/app.module.js';

const TOTAL = 200;
const CONCURRENCY = 50;
const AUTOCANNON_DURATION_S = 10;

const app = await NestFactory.create(AppModule, new FastifyAdapter(), {
	logger : false,
});
await app.init();
await app.listen(0, '127.0.0.1');
const address = app.getHttpAdapter().getInstance().server.address();
const base = `http://127.0.0.1:${address.port}`;

let failed = false;

try {
	// ── Phase A: raw throughput over real TCP ────────────────────────────
	console.log(`phase A: autocannon, ${CONCURRENCY} connections, ${AUTOCANNON_DURATION_S}s → GET /engine/dive-context`);
	const bench = await autocannon({
		url         : base,
		connections : CONCURRENCY,
		duration    : AUTOCANNON_DURATION_S,
		requests    : [{ method: 'GET', path: '/engine/dive-context' }],
	});
	const rps = bench.requests.average;
	const non2xx = bench.non2xx;
	console.log(`phase A done: ${bench.requests.total} requests, avg ${rps} req/s, non-2xx: ${non2xx}`);
	if (non2xx > 0) {
		throw new Error(`phase A: ${non2xx} non-2xx responses`);
	}

	// ── Phase B: attribution proof across real crash boundaries ──────────
	console.log(`phase B: ${TOTAL} crash requests, ${CONCURRENCY} in flight, unique marker each`);
	const sent = new Map(); // uuid → marker
	let next = 0;

	async function worker () {
		while (next < TOTAL) {
			const i = next++;
			const marker = `load-marker-${i}`;
			const mode = i % 2 === 0 ? 'sync' : 'async';
			const res = await fetch(`${base}/engine/dive-crash?mode=${mode}&payload=${marker}`);
			if (res.status !== 200) {
				throw new Error(`dive-crash responded ${res.status}`);
			}
			const body = await res.json();
			sent.set(body.uuid, marker);
		}
	}
	await Promise.all(Array.from({ length: CONCURRENCY }, worker));

	// Every crash escapes to process level; poll until each report lands.
	async function pollReport (uuid) {
		for (let attempt = 0; attempt < 100; attempt++) {
			const res = await fetch(`${base}/engine/dive-crash-report?uuid=${uuid}`);
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

	let misattributed = 0;
	let missing = 0;
	for (const [uuid, marker] of sent) {
		const report = await pollReport(uuid);
		if (!report) {
			missing++;
			continue;
		}
		const dataOk = report.instanceData
			&& report.instanceData.uuid === uuid
			&& report.instanceData.payload === marker;
		const flowOk = Array.isArray(report.flow)
			&& report.flow.length > 0
			&& report.flow.some((edge) => edge.status === 'error');
		if (report.uuid !== uuid || !dataOk || !flowOk) {
			misattributed++;
			console.error(`MISATTRIBUTION for ${uuid}:`, JSON.stringify(report));
		}
	}

	// …and the process survived 200 process-level failures
	const health = await fetch(`${base}/engine/health`);
	const alive = health.status === 200;

	console.log('---');
	console.log(`sent          : ${sent.size}`);
	console.log(`retrieved     : ${sent.size - missing}`);
	console.log(`misattributed : ${misattributed}`);
	console.log(`server alive  : ${alive}`);

	if (missing > 0 || misattributed > 0 || !alive) {
		failed = true;
		console.error('LOAD PROOF FAILED');
	} else {
		console.log('LOAD PROOF PASSED — every failure carried its own data');
	}
} finally {
	await app.close();
}

process.exit(failed ? 1 : 0);
