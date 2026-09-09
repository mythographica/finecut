/**
 * E2E: the full bundle — what the user receives when a mnemonica construction
 * fails behind the whole stack (mti boundary feed → mvp validation+creation →
 * domain guard invocation).
 *
 * The error response must carry, in one payload:
 *   1. core's composite stack with the three sections, pointing at three
 *      separate files: definition (invoice.types), creation (the adapter's
 *      pipe), invocation (guard) — the same shape core's own tests print;
 *   2. Thunderstruck pre-root data: the RAW request and the VALIDATED DTO,
 *      still resolvable after the failure (creationError never releases);
 *   3. dive's flow branch, with the error edge marked.
 *
 * The failing case also prints the composite stack to the console — same as
 * `npm test` on mnemonica core does — so the achievement is visible, not
 * just asserted.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
// Import the compiled module: NestJS constructor injection relies on
// design:paramtypes metadata, which vitest's esbuild transform does not emit.
import { AppModule } from '../build/src/app.module.js';

type FullBundle500 = {
	error: { name: string; message: string };
	stack: string[];
	preRoot: {
		raw?: { method: string; url: string; body?: unknown };
		validated?: { title: string; total: number };
	} | null;
	flow: Array<{ name: string; kind: string; status: string }>;
};

describe('Full-bundle error shape (e2e)', () => {
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

	it('success path: valid invoice is constructed, preRoot wired into the instance', async () => {
		const res = await app.inject({
			method  : 'POST',
			url     : '/bundle/invoice',
			payload : {
				title    : 'Good invoice',
				price    : 25,
				quantity : 4,
				total    : 100,
			},
		});
		expect(res.statusCode).toBe(201);
		const body = JSON.parse(res.payload) as Record<string, unknown>;
		expect(body.title).toBe('Good invoice');
		const preRoot = body.preRoot as { raw?: { url?: string }; validated?: { title?: string } };
		expect(preRoot.raw?.url).toBe('/bundle/invoice');
		expect(preRoot.validated?.title).toBe('Good invoice');
	});

	it('failure path: 500 carries composite stack + preRoot + flow', async () => {
		const res = await app.inject({
			method  : 'POST',
			url     : '/bundle/invoice',
			payload : {
				title    : 'Bad invoice',
				price    : 25,
				quantity : 4,
				total    : 90,
			},
		});
		expect(res.statusCode).toBe(500);
		const bundle = JSON.parse(res.payload) as FullBundle500;

		// 1. the guard's invariant is the reported failure
		expect(bundle.error.message).toContain('does not match price × quantity (100)');

		// 2. core's composite stack: the three sections, three separate files
		const stackText = bundle.stack.join('\n');
		expect(stackText).toContain('<-- creation of [ InvoiceEntity ] traced -->');
		expect(stackText).toContain('<-- with the following error -->');
		expect(stackText).toContain('<-- of constructor definitions stack -->');
		// vite-node resolves source paths, so the frames point at .ts files
		// (in a plain-node run of the build these are the same files, .js).
		expect(stackText).toContain('guard.ts'); // invocation
		expect(stackText).toContain('invoice.types.ts'); // definition

		// eslint-disable-next-line no-console
		console.log('\n========== FULL BUNDLE: composite error stack ==========\n');
		// eslint-disable-next-line no-console
		console.log(stackText);
		// eslint-disable-next-line no-console
		console.log('\n========================================================\n');

		// 3. Thunderstruck pre-root data survived the construction failure
		expect(bundle.preRoot?.raw?.method).toBe('POST');
		expect((bundle.preRoot?.raw?.body as { title?: string })?.title).toBe('Bad invoice');
		expect(bundle.preRoot?.validated?.title).toBe('Bad invoice');

		// 4. dive's flight recorder holds the failed construction edge
		expect(bundle.flow.some((edge) => edge.name === 'InvoiceEntity' && edge.status === 'error')).toBe(true);

		// and the server is fine
		const health = await app.inject({ method: 'GET', url: '/engine/health' });
		expect(health.statusCode).toBe(200);
	});
});
