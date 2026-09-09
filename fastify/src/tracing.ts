/**
 * OpenTelemetry tracing bootstrap — must be imported FIRST in the entry
 * file, before Fastify and any other instrumented module, so the
 * auto-instrumentations patch them at load time.
 *
 * Identical setup in every finecut backend; only the service name differs.
 * Spans go to the local Jaeger all-in-one (../../docker-compose.yml).
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { trace, SpanStatusCode } from '@opentelemetry/api';

const sdk = new NodeSDK({
	resource        : resourceFromAttributes({
		[ ATTR_SERVICE_NAME ] : 'finecut-fastify',
	}),
	traceExporter   : new OTLPTraceExporter({
		url : 'http://localhost:4318/v1/traces',
	}),
	instrumentations : [ getNodeAutoInstrumentations() ],
});

sdk.start();

export type ProcessErrorKind = 'uncaughtException' | 'unhandledRejection';

/**
 * Root error span for process-level failures. By definition an
 * uncaughtException escaped every instrumented context, so there is no
 * parent to attach to — this starts a fresh trace. recordException() is
 * what puts exception.type / message / stacktrace into Jaeger.
 */
export function reportProcessError (err : Error, kind : ProcessErrorKind) : void {
	const tracer = trace.getTracer('finecut-process-errors');
	const span = tracer.startSpan(kind, {
		attributes : { 'process.error.kind' : kind },
	});
	span.recordException(err);
	span.setStatus({ code : SpanStatusCode.ERROR, message : err.message });
	span.end();
}

/** Flush pending spans (batch exporter) — call before process.exit. */
export async function flushTracing () : Promise<void> {
	await sdk.shutdown();
}
