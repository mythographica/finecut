/**
 * Observability bootstrap — @mnemonica/otel wiring. Must be imported FIRST
 * in the entry file, so the tracer provider is registered before any
 * mnemonica construction or dive-wrapped call happens.
 *
 * Replaces the raw NodeSDK + auto-instrumentations setup of the plain
 * finecut-nest demo: the request span is created explicitly by
 * runInRequestScope (see the RequestScopeMiddleware in app.module.ts), so
 * no HTTP auto-instrumentation is needed — adding it would double every
 * request span. Spans go to the local Jaeger all-in-one
 * (../../docker-compose.yml).
 */
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { trace } from '@opentelemetry/api';
import {
	attachHooks,
	MnemonicaOtelProvider,
	DiveOtelProvider,
	AsyncFlowProvider,
	buildUnblindReport,
	recordUnblindTelemetry,
} from '@mnemonica/otel';
import type { TypesCollection } from 'mnemonica/module';

const tracerProvider = new NodeTracerProvider({
	resource        : resourceFromAttributes({
		[ ATTR_SERVICE_NAME ] : 'finecut-nest-otel',
	}),
	spanProcessors : [ new SimpleSpanProcessor(new OTLPTraceExporter({
		url : 'http://localhost:4318/v1/traces',
	})) ],
});

tracerProvider.register();

export const tracer = trace.getTracer('finecut-nest-otel');

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

export type ProcessErrorKind = 'uncaughtException' | 'unhandledRejection';

/**
 * Process-level failure reporting, the Unblinder way: the report carries
 * the dive branch that led to the error, the errored construction and the
 * attempted args — recovered from the error OBJECT itself, which is the
 * whole point of dive at the uncaughtException/unhandledRejection
 * boundary. recordUnblindTelemetry emits the pinned
 * 'mnemonica.caught-exception' span plus the '[unblind]' stdout marker.
 */
export function reportProcessError (err : Error, kind : ProcessErrorKind) : void {
	const report = buildUnblindReport(err);
	recordUnblindTelemetry(report, err);
	// recordUnblindTelemetry already printed the '[unblind]' marker; this
	// line only records WHICH process boundary fired (runbooks grep both).
	console.error(`process boundary: ${kind}`);
}

/** Flush pending spans — call before process.exit. */
export async function flushTracing () : Promise<void> {
	await tracerProvider.shutdown();
}
