/**
 * FullBundleFilter — turns a construction failure into the full bundle the
 * API consumer receives:
 *
 *   error   — name + message of the failure
 *   stack   — core's composite stack, line by line:
 *             "<-- creation of [ InvoiceEntity ] traced -->" (the pipe's new),
 *             "<-- with the following error -->" (guard.ts, the invocation),
 *             "<-- of constructor definitions stack -->" (invoice.types.ts)
 *   preRoot — Thunderstruck: the RAW request and the VALIDATED DTO of this
 *             very request. The filter resolves them by req.body — object
 *             identity again — and they are still there because dive does
 *             NOT release pending payloads on creationError.
 *   flow    — dive's flight recorder: the branch that produced the error.
 */
import type { ExceptionFilter, ArgumentsHost } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { formatFlow, getPreRoot } from '@mnemonica/nestjs';

@Catch()
export class FullBundleFilter implements ExceptionFilter {
	catch (error: Error, host: ArgumentsHost): void {
		const req = host.switchToHttp().getRequest<FastifyRequest>();
		const res = host.switchToHttp().getResponse<FastifyReply>();

		const preRoot = req.body !== undefined ? getPreRoot(req.body) : undefined;
		const flow = formatFlow(error);

		res.status(500).send({
			error: {
				name    : error.name,
				message : error.message,
			},
			stack   : typeof error.stack === 'string' ? error.stack.split('\n') : [],
			preRoot : preRoot ?? null,
			flow,
		});
	}
}
