/**
 * E2E: the full bundle for unhandledRejection — what the user receives when
 * an ASYNC mnemonica construction fails fire-and-forget and the rejection
 * escapes every Nest boundary to process level.
 *
 * The captured bundle must carry, in one payload:
 *   1. core's composite stack with the three sections, pointing at three
 *      separate files: definition (invoice-async.types), creation (the
 *      controller's fire-and-forget `new`), invocation (guard);
 *   2. Thunderstruck pre-root data: the RAW request payload — resolvable
 *      after the failure because the rejection reason is core's errored
 *      instance, whose props carry the original args (object identity),
 *      and because a failed construction never releases the collector;
 *   3. dive's flow branch, with the error edge marked.
 *
 * The test prints the composite stack to the console — same as `npm test`
 * on mnemonica core does — so the achievement is visible, not just asserted.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
// Import the compiled module: NestJS constructor injection relies on
// design:paramtypes metadata, which vitest's esbuild transform does not emit.
import { AppModule } from '../build/src/app.module.js';

type RejectionReport = {
	requestId: string;
	error: { name: string; message: string };
	stack: string[];
	preRoot: {
		raw?: { method: string; url: string; body?: { requestId?: string; title?: string } };
		validated?: unknown;
	} | null;
	flow: Array<{ name: string; kind: string; status: string }>;
};

describe('Full-bundle unhandledRejection (e2e)', () => {
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

	async function pollReport (requestId: string): Promise<RejectionReport> {
		for (let attempt = 0; attempt < 60; attempt++) {
			const res = await app.inject({
				method : 'GET',
				url    : `/bundle/rejection-report?requestId=${requestId}`,
			});
			if (res.statusCode === 200) {
				const result = JSON.parse(res.payload) as RejectionReport;
				return result;
			}
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 50);
			});
		}
		throw new Error(`rejection report for ${requestId} never appeared`);
	}

	it('async construction failure escapes as unhandledRejection and stays fully inspectable', async () => {
		const requestId = `bundle-${Math.random().toString(36).slice(2, 10)}`;
		const res = await app.inject({
			method  : 'POST',
			url     : '/bundle/invoice-async',
			payload : {
				requestId,
				title    : 'Async bad invoice',
				price    : 25,
				quantity : 4,
				total    : 90,
			},
		});
		// fire-and-forget: the request itself succeeds, the failure comes later
		expect(res.statusCode).toBe(201);
		expect(JSON.parse(res.payload)).toEqual({ requestId });

		const report = await pollReport(requestId);

		// 1. the guard's invariant is the reported failure
		expect(report.error.name).toBe('TypeError');
		expect(report.error.message).toContain('does not match price × quantity (100)');

		// 2. core's composite stack: the three sections, three separate files
		//    (vite-node resolves source paths; a plain-node run of the build
		//    shows the same files as .js — assert on the basename)
		const stackText = report.stack.join('\n');
		expect(stackText).toContain('<-- creation of [ InvoiceEntityAsync ] traced -->');
		expect(stackText).toContain('<-- with the following error -->');
		expect(stackText).toContain('<-- of constructor definitions stack -->');
		expect(stackText).toContain('invoice-async.types'); // definition + handler
		expect(stackText).toContain('guard'); // invocation

		// the creation section itself names the call site: core captures the
		// creation stack at `new` time for async constructions — by the time a
		// rejection is wrapped, the caller has unwound and an error-time
		// capture could not see it
		const creationSection = stackText.split('<-- with the following error -->')[0];
		expect(creationSection).toContain('bundle.controller');

		// eslint-disable-next-line no-console
		console.log('\n========== FULL BUNDLE: unhandledRejection composite stack ==========\n');
		// eslint-disable-next-line no-console
		console.log(stackText);
		// eslint-disable-next-line no-console
		console.log('\n=====================================================================\n');

		// 3. Thunderstruck pre-root data survived: resolved from the original
		//    construction args (the same body object mti stamped)
		expect(report.preRoot?.raw?.method).toBe('POST');
		expect(report.preRoot?.raw?.url).toBe('/bundle/invoice-async');
		expect(report.preRoot?.raw?.body?.requestId).toBe(requestId);
		expect(report.preRoot?.raw?.body?.title).toBe('Async bad invoice');

		// 4. dive's flight recorder holds the failed construction edge
		expect(report.flow.some((edge) => edge.name === 'InvoiceEntityAsync' && edge.status === 'error')).toBe(true);

		// and the server is fine — the process survived a real unhandledRejection
		const health = await app.inject({ method: 'GET', url: '/engine/health' });
		expect(health.statusCode).toBe(200);
	});
});
