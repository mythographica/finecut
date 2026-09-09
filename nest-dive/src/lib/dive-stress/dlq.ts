/**
 * Dead Letter Queue for dive stress test.
 *
 * Collects failed instances from uncaughtException and unhandledRejection.
 * Produces a comprehensive report when threshold is reached.
 */
import { current } from '@mnemonica/dive';
import { getProps } from 'mnemonica';

interface FailedInstance {
	requestId   : string;
	uuid        : string;
	instance    : object;
	errorType   : 'sync-throw' | 'unhandled-rejection' | 'creation-error';
	timestamp   : number;
	diveContext : string | null;
}

const DLQ : FailedInstance[] = [];
const DLQ_THRESHOLD = 12;

function getInstanceTypeName (instance : object) : string {
	try {
		const p = getProps(instance);
		return p?.__type__?.TypeName ?? 'unknown';
	} catch {
		return 'unknown';
	}
}

function getDiveContextName () : string | null {
	const ctx = current();
	if (!ctx) return null;
	return getInstanceTypeName(ctx);
}

function produceReport () : void {
	const byRequest = new Map<string, number>();
	const byType = new Map<string, number>();
	const samples : string[] = [];

	for (const item of DLQ) {
		byRequest.set(item.requestId, (byRequest.get(item.requestId) || 0) + 1);
		byType.set(item.errorType, (byType.get(item.errorType) || 0) + 1);
		if (samples.length < 5) {
			samples.push(`${item.requestId}/${item.uuid}`);
		}
	}

	// eslint-disable-next-line no-console
	console.error('\n========== DIVE STRESS DLQ REPORT ==========');
	// eslint-disable-next-line no-console
	console.error(`total failed      : ${DLQ.length}`);
	// eslint-disable-next-line no-console
	console.error(`by error type     : ${[...byType.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`);
	// eslint-disable-next-line no-console
	console.error(`by request        : ${[...byRequest.entries()].map(([k, v]) => `${k.slice(0, 8)}...=${v}`).join(', ')}`);
	// eslint-disable-next-line no-console
	console.error(`sample uuids      : ${samples.join(', ')}`);
	// eslint-disable-next-line no-console
	console.error('ALS would lose    : all context (different async resources)');
	// eslint-disable-next-line no-console
	console.error('dive preserves    : instance-linked context through wrapped callbacks');
	// eslint-disable-next-line no-console
	console.error('========== END DLQ REPORT ==========\n');

	DLQ.length = 0;
}

export function pushToDlq (params: {
	requestId : string;
	uuid      : string;
	instance  : object;
	errorType : FailedInstance['errorType'];
}) : void {
	const item : FailedInstance = {
		requestId   : params.requestId,
		uuid        : params.uuid,
		instance    : params.instance,
		errorType   : params.errorType,
		timestamp   : Date.now(),
		diveContext : getDiveContextName(),
	};

	DLQ.push(item);

	// eslint-disable-next-line no-console
	console.error(
		`[DLQ] +1  ${params.errorType.padEnd(20)}  req=${params.requestId.slice(0, 8)}...  ` +
		`uuid=${params.uuid.slice(0, 12)}...  diveCtx=${item.diveContext ?? 'none'}  ` +
		`(total: ${DLQ.length}/${DLQ_THRESHOLD})`
	);

	if (DLQ.length >= DLQ_THRESHOLD) {
		produceReport();
	}
}
