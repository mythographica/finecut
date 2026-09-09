/**
 * Observability wiring proof — the @mnemonica/otel stack over one real
 * request through the actual Nest app, asserted against an in-memory
 * exporter (no Jaeger needed).
 *
 * The provider with the InMemorySpanExporter is registered BEFORE the
 * compiled AppModule is imported: src/tracing.js calls
 * tracerProvider.register() at import time, and OTel's API ignores a
 * duplicate registration — so the appwide tracer/otel/asyncFlow exports
 * resolve onto THIS provider and every span lands in memory.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';

type SpanShape = {
	name: string;
	parentSpanContext?: { spanId: string };
	// pre-2.x field name, kept for older exporters
	parentSpanId?: string;
	spanContext: () => { spanId: string };
	attributes: Record<string, unknown>;
};

function parentIdOf (span: SpanShape): string | undefined {
	const parent = span.parentSpanContext?.spanId ?? span.parentSpanId;
	return parent;
}

describe('observability wiring (e2e)', () => {
	let app: import('@nestjs/platform-fastify').NestFastifyApplication;
	let exporter: InMemorySpanExporter;
	let provider: NodeTracerProvider;

	beforeAll(async () => {
		exporter = new InMemorySpanExporter();
		provider = new NodeTracerProvider({
			spanProcessors: [ new SimpleSpanProcessor(exporter) ],
		});
		provider.register();

		const { Test } = await import('@nestjs/testing');
		const { FastifyAdapter } = await import('@nestjs/platform-fastify');
		// Import the compiled module AFTER the provider registration —
		// see the file header for why the order matters.
		const { AppModule } = await import('../build/src/app.module.js');

		const moduleRef = await Test.createTestingModule({
			imports: [ AppModule ],
		}).compile();

		app = moduleRef.createNestApplication(
			new FastifyAdapter()
		);
		await app.init();
		await app.getHttpAdapter().getInstance().ready();
	});

	afterAll(async () => {
		await app.close();
		await provider.shutdown();
	});

	it('produces one coherent trace for a page request', async () => {
		exporter.reset();
		const res = await app.inject({ method: 'GET', url: '/' });
		expect(res.statusCode).toBe(200);

		const spans = exporter.getFinishedSpans() as unknown as SpanShape[];
		const names = spans.map((s) => s.name);

		// The request span — runInRequestScope names it from req.url, and
		// the raw IncomingMessage exposes no route pattern, so it is the
		// raw url. Verified shape on both cache states.
		expect(names).toContain('HTTP GET /');
		// Construction spans follow the prototype chain
		for (const typeName of [ 'RequestData', 'RouteData', 'PageData', 'RenderData', 'ResponseData' ]) {
			expect(names).toContain(`mnemonica.${typeName}`);
		}
		// Wrapped sync-splits recorded as dive-edge spans, named after the
		// wrapping function expression (the caption becomes the span name).
		// NOTE: the static cache (settings.static, shared with finecut-bff)
		// decides whether the render path runs at all — on a cache HIT the
		// parseContent/mainMenu/leftMenu/renderTemplate wraps never execute.
		// These two are emitted on BOTH paths (verified live), so they are
		// the only names asserted here; on a miss the extra dive.call spans
		// appear without breaking anything below.
		for (const call of [ 'loadPage', 'staticCache' ]) {
			expect(names).toContain(`dive.call:${call}`);
		}

		// One coherent trace: every span of this request hangs directly
		// under the request span. Construction spans close at postCreation,
		// so the SEQUENTIAL chain in the route handler is a row of siblings
		// — the next construction's ALS parent is the request span again.
		const byName = (name: string): SpanShape => {
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
});
