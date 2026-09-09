/**
 * Rejection report — the retrieval half of the unhandledRejection demo.
 *
 * Registers a process-level unhandledRejection listener (once) that captures
 * whatever a fire-and-forget construction lets escape. The rejection reason
 * IS core's errored mnemonica instance, so one object carries everything:
 *
 *   reason.stack            → the composite three-section stack
 *   getProps(reason).args   → the ORIGINAL construction arguments — the same
 *                             body object mti stamped at the boundary, so
 *                             getPreRoot(args[0]) still resolves this
 *                             request's raw + validated payloads (a failed
 *                             construction never releases the collector)
 *   getFlow(reason)         → dive's flight recorder: the failed branch
 *
 * Reports are keyed by the client-supplied requestId inside the body (the
 * real-world counterpart of an idempotency key), so the HTTP layer can poll
 * for the report after the fact. Listeners coexist with app.module's own
 * handlers: every listener runs; theirs logs and pushes to DLQ, ours records
 * the retrievable bundle.
 */
import { getProps } from 'mnemonica/module';
import { formatFlow, getPreRoot, type FormattedFlowEdge, type PreRootData } from '@mnemonica/nestjs';

export type RejectionFlowEdge = FormattedFlowEdge;

export type RejectionReport = {
	requestId  : string;
	error      : { name: string; message: string };
	stack      : string[];
	preRoot    : PreRootData | null;
	flow       : RejectionFlowEdge[];
	capturedAt : string;
};

const reports = new Map<string, RejectionReport>();

function capture (reason: Error): void {
	// The error additions slot holds the construction args (see core's
	// throwModificationError: setProps(erroredInstance, { args, ... })).
	const props = getProps(reason) as unknown as { args?: unknown[] } | undefined;
	const data = props?.args?.[0] as { requestId?: unknown } | undefined;
	if (!data || typeof data.requestId !== 'string') {
		return;
	}
	const requestId = data.requestId;
	if (!requestId.startsWith('bundle-')) {
		// only this demo's errors belong in this store
		return;
	}

	const flow = formatFlow(reason);

	const report: RejectionReport = {
		requestId,
		error      : {
			name    : reason.name,
			message : reason.message,
		},
		stack      : typeof reason.stack === 'string' ? reason.stack.split('\n') : [],
		preRoot    : getPreRoot(data) ?? null,
		flow,
		capturedAt : new Date().toISOString(),
	};
	reports.set(requestId, report);
}

let armed = false;

/**
 * Attach the capture listener. Idempotent — safe to call per request.
 */
export function armRejectionCapture (): void {
	if (armed) return;
	armed = true;
	process.on('unhandledRejection', (reason) => {
		if (reason instanceof Error) {
			capture(reason);
		}
	});
}

export function readRejectionReport (requestId: string): RejectionReport | undefined {
	const result = reports.get(requestId);
	return result;
}
