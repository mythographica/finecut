/**
 * Observability wiring proof — the @mnemonica/otel stack over one real
 * request, asserted against an in-memory exporter (no Jaeger needed).
 *
 * Mirrors server.ts exactly: same onRequest hook, same attach order. The
 * app is built here (not imported from server.ts) so the tracer provider
 * can point at memory instead of OTLP.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import Fastify, { type FastifyInstance } from 'fastify';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
	InMemorySpanExporter,
	SimpleSpanProcessor,
	type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';
import { trace } from '@opentelemetry/api';
import {
	attachHooks,
	MnemonicaOtelProvider,
	DiveOtelProvider,
	AsyncFlowProvider,
	runInRequestScope,
	feedPreRootFromRequest,
	buildUnblindReport,
	recordUnblindTelemetry,
} from '@mnemonica/otel';
import { wrap, getErrorInstance } from '@mnemonica/dive';
import { settings } from '../../src/core/settings.js';

const ROOT = process.cwd();

function parentIdOf (span: ReadableSpan): string | undefined {
	const parent = span.parentSpanContext?.spanId;
	return parent;
}

describe('observability wiring', () => {
	let app: FastifyInstance;
	let exporter: InMemorySpanExporter;
	let provider: NodeTracerProvider;

	beforeAll(async () => {
		exporter = new InMemorySpanExporter();
		provider = new NodeTracerProvider({
			spanProcessors: [new SimpleSpanProcessor(exporter)],
		});
		provider.register();

		const tracer = trace.getTracer('finecut-fastify-otel-test');
		const otel = new MnemonicaOtelProvider(tracer);
		const diveOtel = new DiveOtelProvider(tracer);
		const asyncFlow = new AsyncFlowProvider();

		const { defaultTypes } = await import('mnemonica');
		await import('../../src/core/collections/requestTypes.js');
		await import('../../src/core/collections/engineTypes.js');

		attachHooks(defaultTypes);
		otel.attachHooks(defaultTypes);
		diveOtel.attach();
		asyncFlow.attach();

		app = Fastify({ logger: false });
		// Same hook as server.ts: pre-root feed + triple async scope, added
		// BEFORE the routes so every handler runs inside the request span.
		app.addHook('onRequest', (request, reply, done) => {
			feedPreRootFromRequest(request);
			// structural minimum — IncomingMessage.method is optional
			const rawRequest = { method: request.method, url: request.url };
			runInRequestScope(rawRequest, reply.raw, { tracer, otel, asyncFlow }, () => done());
		});
		const { default: registerFrontend } = await import('../../src/routes/frontend.js');
		await registerFrontend(app);
		await app.ready();

		// Neutralize the shared static cache for '/_index': settings.static
		// points at ../bff/data/static (shared with the BFF), so a cache hit
		// would short-circuit the render branch this test asserts on.
		const cachedIndex = path.join(ROOT, settings.static, '/_index');
		await fs.rm(cachedIndex, { recursive: true, force: true });
	});

	afterAll(async () => {
		await app.close();
		await provider.shutdown();
	});

	it('produces one coherent trace for a page request', async () => {
		exporter.reset();
		const res = await app.inject({ method: 'GET', url: '/' });
		expect(res.statusCode).toBe(200);

		const spans = exporter.getFinishedSpans();
		const names = spans.map((s) => s.name);

		// The request span
		expect(names).toContain('HTTP GET /');
		// Construction spans follow the prototype chain
		for (const typeName of ['RequestData', 'RouteData', 'PageData', 'RenderData', 'ResponseData']) {
			expect(names).toContain(`mnemonica.${typeName}`);
		}
		// Wrapped sync-splits recorded as dive-edge spans, named after the
		// wrapping function expression (the caption becomes the span name)
		for (const call of ['loadPage', 'renderTemplate']) {
			expect(names).toContain(`dive.call:${call}`);
		}

		// One coherent trace: every span of this request hangs directly
		// under the request span. Construction spans close at postCreation,
		// so the SEQUENTIAL chain in the route handler is a row of siblings
		// — the next construction's ALS parent is the request span again.
		const byName = (name: string): ReadableSpan => {
			const span = spans.find((s) => s.name === name);
			if (!span) throw new Error(`span not found: ${name}`);
			return span;
		};
		const httpSpan = byName('HTTP GET /');
		const httpSpanId = httpSpan.spanContext().spanId;
		for (const span of spans) {
			if (span === httpSpan) continue;
			expect(parentIdOf(span)).toBe(httpSpanId);
		}
	});

	it('unblind telemetry carries the dive branch onto the error span', () => {
		exporter.reset();
		let thrown: Error | undefined;
		const ctx = { marker: 'unblind-test' };
		const failing = wrap(function failingStep () {
			throw new Error('boom-unblind');
		}, ctx);
		try {
			failing();
		} catch (err) {
			thrown = err as Error;
		}
		if (!thrown) throw new Error('expected throw');

		const report = buildUnblindReport(thrown);
		recordUnblindTelemetry(report, thrown);

		expect(getErrorInstance(thrown)).toBe(ctx);
		const spans = exporter.getFinishedSpans();
		const span = spans.find((s) => s.name === 'mnemonica.caught-exception');
		if (!span) throw new Error('unblind span not found');
		expect(String(span.attributes['dive.branch'])).toContain('failingStep');
	});
});
