/**
 * Process-level error spans for Jaeger.
 *
 * Side-effect-free: uses trace.getTracer(), which is a no-op until an SDK is
 * started (main.ts imports ../tracing.js first). app.module.ts imports this
 * module, so the e2e suite — which loads app.module WITHOUT the SDK — gets
 * harmless no-op spans.
 *
 * The span is deliberately a ROOT span: by definition an uncaughtException
 * escaped every instrumented context, so there is no parent to attach to.
 * recordException() is what puts exception.type / exception.message /
 * exception.stacktrace into Jaeger.
 */
import { trace, SpanStatusCode } from '@opentelemetry/api';

export type ProcessErrorKind = 'uncaughtException' | 'unhandledRejection';

export function reportProcessError (
	err : Error,
	kind : ProcessErrorKind,
	attributes : Record<string, string> = {}
) : void {
	const tracer = trace.getTracer('finecut-process-errors');
	const span = tracer.startSpan(kind, {
		attributes : {
			'process.error.kind' : kind,
			...attributes,
		},
	});
	span.recordException(err);
	span.setStatus({ code : SpanStatusCode.ERROR, message : err.message });
	span.end();
}
