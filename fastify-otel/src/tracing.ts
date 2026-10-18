/**
 * Observability bootstrap — @mnemonica/otel wiring. Must be imported FIRST
 * in the entry file, so the tracer provider is registered before any
 * mnemonica construction or dive-wrapped call happens.
 *
 * The request span is created explicitly by runInEntryScope (see server.ts
 * onRequest hook), so no HTTP auto-instrumentation is needed — adding it
 * would double every request span. Spans go to the local Jaeger all-in-one
 * (../../docker-compose.yml).
 */
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
	attachHooks,
	MnemonicaOtelProvider,
	DiveOtelProvider,
	AsyncFlowProvider,
	captureError,
	analyseError,
	recordErrorAnalysis,
} from '@mnemonica/otel';
import type { ErrorAnalysis } from '@mnemonica/otel';
import type { TypesCollection } from 'mnemonica';

const tracerProvider = new NodeTracerProvider({
	resource        : resourceFromAttributes({
		[ ATTR_SERVICE_NAME ] : 'finecut-fastify-otel',
	}),
	spanProcessors : [ new SimpleSpanProcessor(new OTLPTraceExporter({
		url : 'http://localhost:4318/v1/traces',
	})) ],
});

tracerProvider.register();

export const tracer = trace.getTracer('finecut-fastify-otel');

// The provider trio. Attach EXACTLY ONCE per process — attaching twice
// doubles every span and every ALS frame push.
export const otel      = new MnemonicaOtelProvider(tracer); // spans on constructions
export const diveOtel  = new DiveOtelProvider(tracer);      // spans on wrapped calls
export const asyncFlow = new AsyncFlowProvider();           // ALS attribution backbone

/**
 * Wire a mnemonica collection into the full observability stack:
 * dive lifecycle edges + OTel spans + the ALS async-flow backbone.
 */
export function attachObservability (collection: TypesCollection): void {
	attachHooks(collection);       // mnemonica lifecycle → dive edges
	otel.attachHooks(collection);  // mnemonica lifecycle → OTel spans
	diveOtel.attach();             // dive edges → OTel spans
	asyncFlow.attach();            // unwrapped async hops → parental edge
}

export interface UnblindReport {
	kind     : 'caught-unblinded';
	analysis : ErrorAnalysis;
}

// The fallback ERROR span — fresh span + the analysis event. Shared by
// both boundaries: unblind() when no request span is active, and every
// process-level report (the request span has ended by then).
const recordOnFreshSpan = (analysis: ErrorAnalysis, err: unknown): void => {
	const span = tracer.startSpan('mnemonica.caught-exception');
	span.setStatus({ code: SpanStatusCode.ERROR, message: analysis.message });
	if (err instanceof Error) {
		span.recordException(err);
	}
	recordErrorAnalysis(analysis, span);
	span.end();
};

/**
 * The Unblinder, app-side: analyse the caught failure off its dive trace
 * (captureError is the synchronous phase — references only, safe inside an
 * error boundary) and record the analysis as a 'mnemonica.error' span
 * event. In-request boundaries land it on the request's ACTIVE span (the
 * entry scope ends the span at response finish, so it is still open);
 * without one, a fresh ERROR span carries it. The '[unblind]' stdout
 * marker stays — runbooks grep it.
 */
export function unblind (err: unknown): UnblindReport {
	const analysis = analyseError(captureError(err, { asyncFlow }));
	const report: UnblindReport = { kind: 'caught-unblinded', analysis };
	const activeSpan = trace.getActiveSpan();
	if (activeSpan) {
		recordErrorAnalysis(analysis, activeSpan);
	} else {
		recordOnFreshSpan(analysis, err);
	}
	console.log(`[unblind] ${JSON.stringify(report)}`);
	return report;
}

export type ProcessErrorKind = 'uncaughtException' | 'unhandledRejection';

/**
 * Process-level failure reporting, the Unblinder way: the analysis
 * recovers the dive branch, the errored construction and the attempted
 * args from the error OBJECT itself, which is the whole point of dive at
 * the uncaughtException/unhandledRejection boundary. A process boundary
 * always gets its own ERROR span — by the time the process handler runs,
 * the request span has already ended — and the ALS-held context still
 * parents it into the failing fiber's trace.
 */
export function reportProcessError (err : Error, kind : ProcessErrorKind) : void {
	const analysis = analyseError(captureError(err, { asyncFlow }));
	recordOnFreshSpan(analysis, err);
	// runbooks grep this marker
	console.log(`[unblind] ${JSON.stringify({ kind: 'caught-unblinded', analysis })}`);
	// this line only records WHICH process boundary fired (runbooks grep both)
	console.error(`process boundary: ${kind}`);
}

/** Flush pending spans — call before process.exit. */
export async function flushTracing () : Promise<void> {
	await tracerProvider.shutdown();
}
