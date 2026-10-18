/**
 * UnblindExceptionFilter — global exception boundary, the Unblinder way.
 *
 * NestJS has no route-level error middleware like Express, so this global
 * APP_FILTER is the error boundary: anything escaping a controller lands
 * here. The report carries the analysed dive chain, the errored
 * construction and the attempted args — recovered from the exception
 * OBJECT itself. unblind() records the analysis as a 'mnemonica.error'
 * event on the request's active span (a fresh ERROR span when there is
 * none) plus the '[unblind]' stdout marker.
 *
 * Verified shape: for exceptions thrown in middleware/controller phases,
 * switchToHttp().getResponse() may hand back EITHER the raw ServerResponse
 * or the FastifyReply wrapper — the instanceof narrows both to the raw
 * response, which is what actually carries the bytes.
 */
import { Catch, ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ServerResponse } from 'http';
import { unblind } from './tracing.js';

@Catch()
export class UnblindExceptionFilter implements ExceptionFilter {
	catch (exception: unknown, host: ArgumentsHost): void {
		const report = unblind(exception);

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
