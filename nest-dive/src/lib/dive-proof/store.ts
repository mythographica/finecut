/**
 * Outcome store for the queue-attribution proof.
 *
 * The honesty of the proof lives here: on FAILURE the consumer holds the
 * instance reference in its hands, but we deliberately never read identity
 * from it — attribution is recovered from the ERROR OBJECT alone, via
 * getErrorInstance(err). On success the data that traveled through the
 * method's return value is the identity. If dive ever cross-pinned an error
 * to the wrong instance, the recorded marker would contradict the request
 * that finds this outcome by uuid — and the proof script would catch it.
 */
import { getErrorInstance } from '@mnemonica/dive';
import { utils } from 'mnemonica/module';
import { formatFlow, type FormattedFlowEdge } from '@mnemonica/nestjs';
import type { ProofResult } from './types.js';

export type ProofOutcome = {
	uuid          : string;
	marker        : number | null;
	status        : 'ok' | 'error';
	errorMessage? : string;
	flow?         : FormattedFlowEdge[];
};

const outcomes = new Map<string, ProofOutcome>();

export function recordOk (result: ProofResult) : void {
	const outcome : ProofOutcome = {
		uuid   : result.uuid,
		marker : result.marker,
		status : 'ok',
	};
	outcomes.set(result.uuid, outcome);
}

export function recordFailure (err: unknown) : void {
	if (!(err instanceof Error)) {
		return;
	}
	// Attribution comes from the error object alone — never from the
	// instance reference the queue happens to hold.
	const instance = getErrorInstance(err);
	if (!instance) {
		return;
	}
	const data = utils.extract(instance) as { uuid?: string; marker?: number };
	const uuid = String(data.uuid || 'unknown');
	const outcome : ProofOutcome = {
		uuid,
		marker       : typeof data.marker === 'number' ? data.marker : null,
		status       : 'error',
		errorMessage : err.message,
		flow         : formatFlow(err),
	};
	outcomes.set(uuid, outcome);
}

export function readOutcome (uuid: string) : ProofOutcome | undefined {
	const result = outcomes.get(uuid);
	return result;
}
