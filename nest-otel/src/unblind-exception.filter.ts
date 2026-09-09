/**
 * UnblindExceptionFilter — global exception boundary, the Unblinder way.
 *
 * NestJS has no route-level error middleware like Express, so this global
 * APP_FILTER is the error boundary: anything escaping a controller lands
 * here. The report carries the dive branch that led to the error, the
 * errored construction and the attempted args — recovered from the
 * exception OBJECT itself. recordUnblindTelemetry emits the pinned
 * 'mnemonica.caught-exception' span plus the '[unblind]' stdout marker,
 * parented under the request span by the ALS context.
 *
 * Verified shape: for exceptions thrown in middleware/controller phases,
 * switchToHttp().getResponse() may hand back EITHER the raw ServerResponse
 * or the FastifyReply wrapper — the instanceof narrows both to the raw
 * response, which is what actually carries the bytes.
 */
import { Catch, ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ServerResponse } from 'http';
import { buildUnblindReport, recordUnblindTelemetry } from '@mnemonica/otel';

@Catch()
export class UnblindExceptionFilter implements ExceptionFilter {
	catch (exception: unknown, host: ArgumentsHost): void {
		const report = buildUnblindReport(exception);
		recordUnblindTelemetry(report, exception);

		const reply = host.switchToHttp().getResponse<FastifyReply | ServerResponse>();
		const raw = reply instanceof ServerResponse ? reply : reply.raw;
		if (raw.headersSent) {
			// Response already committed (e.g. a streaming handler died
			// mid-reply) — the telemetry above is all we can add.
			return;
		}
		const body = JSON.stringify(report);
		raw.writeHead(500, { 'content-type': 'application/json' });
		raw.end(body);
	}
}
