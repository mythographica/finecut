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
 * Verified shape ( Nest runs middleware through fastify/middie): the
 * req/res handed to use() are the RAW Node IncomingMessage/ServerResponse,
 * not FastifyRequest/FastifyReply wrappers — so runInRequestScope gets the
 * raw pair directly, exactly like the Express version.
 */
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'http';
import type { HttpRequestLike, RequestLike } from '@mnemonica/otel';
import { runInRequestScope, feedPreRootFromRequest } from '@mnemonica/otel';
import { tracer, otel, asyncFlow } from './tracing.js';

@Injectable()
export class RequestScopeMiddleware implements NestMiddleware {
	use (req: IncomingMessage, res: ServerResponse, next: () => void): void {
		// IncomingMessage types method/url as optional; a real HTTP request
		// always carries both. One structural object feeds both helpers.
		const method = typeof req.method === 'string' ? req.method : 'GET';
		const url = typeof req.url === 'string' ? req.url : '/';
		const request: HttpRequestLike & RequestLike = { method, url };
		feedPreRootFromRequest(request);
		runInRequestScope(request, res, { tracer, otel, asyncFlow }, () => next());
	}
}
