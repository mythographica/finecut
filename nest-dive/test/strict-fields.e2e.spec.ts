/**
 * E2E: the class-fields gap — TypeØmatica strict DTO inside a mnemonica
 * construction, with the comparator + finalize running in the postCreation
 * hook.
 *
 * The report must show:
 *   1. the comparator's verdict: `requestId` passed through the machinery
 *      (constructor-body assignment via the proxy set trap), while the
 *      native class fields `title` and `total` were installed hiddenly
 *      (define semantics — the proxy never saw them);
 *   2. finalize re-guarded them, values preserved;
 *   3. the proof: a wrong-typed write to a formerly-hidden field now throws.
 *
 * The report is printed to the console — the achievement should be visible,
 * not just asserted.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
// Import the compiled module: NestJS constructor injection relies on
// design:paramtypes metadata, which vitest's esbuild transform does not emit.
import { AppModule } from '../build/src/app.module.js';

type StrictReport = {
	requestId: string;
	constructedFields: string[];
	hiddenFields: string[];
	finalized: boolean;
	proofAfterFinalize: string;
	values: { title: string; total: number };
};

describe('Class-fields gap: comparator + finalize in postCreation (e2e)', () => {
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

	it('hidden class fields are found, re-guarded, and the guard is proven over HTTP', async () => {
		const requestId = `strict-${Math.random().toString(36).slice(2, 10)}`;
		const res = await app.inject({
			method  : 'POST',
			url     : '/bundle/strict-invoice',
			payload : {
				requestId,
				title : 'Strict invoice',
				total : 100,
			},
		});
		// sync construction: the postCreation hook has already run
		expect(res.statusCode).toBe(201);
		expect(JSON.parse(res.payload)).toEqual({ requestId });

		const reportRes = await app.inject({
			method : 'GET',
			url    : `/bundle/strict-report?requestId=${requestId}`,
		});
		expect(reportRes.statusCode).toBe(200);
		const report = JSON.parse(reportRes.payload) as StrictReport;

		// eslint-disable-next-line no-console
		console.log('\n========== CLASS FIELDS: comparator + finalize report ==========\n');
		// eslint-disable-next-line no-console
		console.log(JSON.stringify(report, null, 2));
		// eslint-disable-next-line no-console
		console.log('\n================================================================\n');

		// 1. the comparator: constructor-tracked vs hidden class fields
		expect(report.constructedFields).toContain('requestId');
		expect(report.constructedFields).not.toContain('title');
		expect(report.constructedFields).not.toContain('total');
		expect(report.hiddenFields).toContain('title');
		expect(report.hiddenFields).toContain('total');
		expect(report.hiddenFields).not.toContain('requestId');

		// 2. finalize ran and preserved the values
		expect(report.finalized).toBe(true);
		expect(report.values.title).toBe('Strict invoice');
		expect(report.values.total).toBe(100);

		// 3. the proof: wrong-typed write to a formerly-hidden field throws
		expect(report.proofAfterFinalize).toContain('threw');
		expect(report.proofAfterFinalize).toContain('Type Mismatch');

		// and the server is fine
		const health = await app.inject({ method: 'GET', url: '/engine/health' });
		expect(health.statusCode).toBe(200);
	});
});
