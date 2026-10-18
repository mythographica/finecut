/**
 * RequestScopeMiddleware — global middleware wrapping every request in the
 * @mnemonica/otel triple scope.
 *
 * One 'HTTP {method} {url}' span per request (created explicitly here, so
 * no HTTP auto-instrumentation is needed), the thunderstruck pre-root feed
 * (payloads correlated by object identity), and the triple async scope
 * (provider ALS + OTEL global context + async-flow root frame) around
 * everything downstream. This is the Nest+Fastify counterpart of
 * express-otel's server.ts middleware.
 *
 * Verified shape (Nest runs middleware through fastify/middie): the
 * req/res handed to use() are the RAW Node IncomingMessage/ServerResponse,
 * not FastifyRequest/FastifyReply wrappers — so the raw request line
 * (method + url) is all the pre-root feed can see at this stage; params /
 * query / body are not parsed yet and simply don't correlate. The span
 * closes on the raw response's 'finish'.
 */
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'http';
import { runInEntryScope, feedPreRoot } from '@mnemonica/otel';
import { tracer, otel, asyncFlow } from './tracing.js';

@Injectable()
export class RequestScopeMiddleware implements NestMiddleware {
	use (req: IncomingMessage, res: ServerResponse, next: () => void): void {
		// IncomingMessage types method/url as optional; a real HTTP request
		// always carries both.
		const method = typeof req.method === 'string' ? req.method : 'GET';
		const url = typeof req.url === 'string' ? req.url : '/';
		feedPreRoot({ method, url });
		runInEntryScope({
			name        : `HTTP ${method} ${url}`,
			attributes  : {
				'http.method' : method,
				'http.url'    : url,
			},
			endOnReturn : false,
		}, { tracer, otel, asyncFlow }, (span) => {
			res.on('finish', () => {
				span.setAttribute('http.status_code', res.statusCode);
				span.end();
			});
			next();
		});
	}
}
