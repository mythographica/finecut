/**
 * E2E test for the queue-attribution proof.
 *
 * Locks the "request 42 stays 42" claim into CI: 28 marker requests (markers
 * 1..28; 7, 17, 27 expected to fail) are fired into the random-order,
 * random-delay queue, then every outcome is polled back BY UUID and must
 * carry exactly the marker it was sent with, the status its marker dictates,
 * and — for failures — a flight-recorder branch ending in an 'error' edge.
 *
 * The heavyweight version (140 requests over real TCP) is
 * scripts/queue-attribution-proof.mjs (`npm run proof:queue`).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
// Import the compiled module: NestJS constructor injection relies on
// design:paramtypes metadata, which vitest's esbuild transform does not emit.
import { AppModule } from '../build/src/app.module.js';

type ProofOutcomePayload = {
	uuid: string;
	marker: number | null;
	status: 'ok' | 'error';
	errorMessage?: string;
	flow?: Array<{ name: string; kind: string; status: string }>;
};

describe('Queue-attribution proof (e2e)', () => {
	let app: NestFastifyApplication;

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
		await app.init();
		await app.getHttpAdapter().getInstance().ready();
	});

	afterAll(async () => {
		await app.close();
	});

	async function pollOutcome (uuid: string): Promise<ProofOutcomePayload> {
		for (let attempt = 0; attempt < 200; attempt++) {
			const res = await app.inject({ method: 'GET', url: `/proof/${uuid}` });
			if (res.statusCode === 200) {
				const result = JSON.parse(res.payload) as ProofOutcomePayload;
				return result;
			}
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 50);
			});
		}
		throw new Error(`outcome for ${uuid} never appeared`);
	}

	it('every marker keeps its identity through the random-delay queue', async () => {
		const TOTAL = 28;
		const sent = new Map<string, { marker: number; expected: 'ok' | 'fail' }>();

		await Promise.all(Array.from({ length: TOTAL }, async (_, i) => {
			const marker = i + 1;
			const expected = marker % 10 === 7 ? 'fail' : 'ok';
			const res = await app.inject({
				method  : 'POST',
				url     : '/proof',
				payload : { marker, expect: expected },
			});
			expect(res.statusCode).toBe(201);
			const body = JSON.parse(res.payload) as { uuid: string };
			sent.set(body.uuid, { marker, expected });
		}));

		expect(sent.size).toBe(TOTAL);

		await Promise.all([...sent.entries()].map(async ([uuid, { marker, expected }]) => {
			const outcome = await pollOutcome(uuid);

			// the identity that came back is the identity that went in
			expect(outcome.uuid).toBe(uuid);
			expect(outcome.marker).toBe(marker);

			// and the outcome is the one the marker dictated
			expect(outcome.status).toBe(expected === 'fail' ? 'error' : 'ok');

			if (expected === 'fail') {
				expect(outcome.errorMessage).toContain(`marker ${marker}`);
				const flow = outcome.flow || [];
				expect(flow.length).toBeGreaterThan(0);
				expect(flow.some((edge) => edge.status === 'error')).toBe(true);
				expect(flow.map((edge) => edge.name)).toContain('process');
			}
		}));

		// the process is very much alive afterwards
		const health = await app.inject({ method: 'GET', url: '/engine/health' });
		expect(health.statusCode).toBe(200);
	}, 30000);
});
