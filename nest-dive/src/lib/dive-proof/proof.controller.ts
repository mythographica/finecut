/**
 * ProofController — HTTP surface of the queue-attribution proof.
 *
 *   POST /proof        — body { marker, expect }: constructs a ProofEntity,
 *                        enqueues it for delayed random-order processing,
 *                        and immediately returns { uuid, marker, expect }.
 *                        The request/response cycle ends HERE — the outcome
 *                        lands later, somewhere in the queue's future.
 *   GET  /proof/:uuid  — 404 { ready: false } until the queue has processed
 *                        that instance; then the recorded outcome.
 */
import { Controller, Get, Post, Body, Param, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ProofEntity } from './types.js';
import type { ProofExpectation } from './types.js';
import { enqueueProof } from './queue.js';
import { readOutcome } from './store.js';

@Controller('proof')
export class ProofController {
	@Post()
	createProof (@Body() body: { marker?: number; expect?: string }) {
		const expect : ProofExpectation = body?.expect === 'fail' ? 'fail' : 'ok';
		const uuid = `proof-${Math.random().toString(36).slice(2, 12)}`;
		const marker = Number(body?.marker ?? 0);
		const instance = new ProofEntity({ uuid, marker, expect });
		enqueueProof(instance);
		const result = { uuid, marker, expect, queued: true };
		return result;
	}

	@Get(':uuid')
	readProof (@Param('uuid') uuid: string, @Res() res: FastifyReply) {
		const outcome = readOutcome(String(uuid || ''));
		if (!outcome) {
			return res.status(404).type('application/json').send({
				ready : false,
				uuid,
			});
		}
		return res.type('application/json').send(outcome);
	}
}
