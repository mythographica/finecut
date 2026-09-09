/**
 * Strict report — the comparator + finalize wiring of the class-fields demo.
 *
 * Registered (once) as a postCreation hook on defaultTypes. When a
 * StrictInvoiceEntity is constructed, the hook takes its TypeØmatica DTO
 * and runs the comparator the Thunderstruck design calls for:
 *
 *   getConstructedFields(dto)   — fields that certainly passed through the
 *                                 strict define machinery (constructor-body
 *                                 assignments via the proxy set trap)
 *   Reflect.ownKeys(dto)        — every own field, including the ones
 *                                 class-field initializers installed with
 *                                 define semantics, bypassing the proxy
 *   difference                  — the hidden fields: present, writable,
 *                                 and completely unguarded
 *
 * Then finalize(dto) re-establishes the hidden fields through the machinery
 * (values preserved), and the hook proves the guard is real by attempting a
 * wrong-typed write — which now throws. The report is stored by requestId
 * for the HTTP layer to serve.
 */
import { finalize, getConstructedFields, isFinalized } from 'typeomatica';
import { defaultTypes } from 'mnemonica/module';
import type { StrictInvoice } from './strict-invoice.types.js';

export type StrictReport = {
	requestId          : string;
	constructedFields  : string[];
	hiddenFields       : string[];
	finalized          : boolean;
	proofAfterFinalize : string;
	values             : { title: string; total: number };
	capturedAt         : string;
};

const reports = new Map<string, StrictReport>();

let armed = false;

/**
 * Attach the postCreation hook. Idempotent — safe to call per request.
 */
export function armStrictFinalize (): void {
	if (armed) return;
	armed = true;
	defaultTypes.registerHook('postCreation', (hookData) => {
		if (hookData.TypeName !== 'StrictInvoiceEntity') {
			return;
		}
		const instance = hookData.inheritedInstance as { dto?: StrictInvoice } | undefined;
		const dto = instance?.dto;
		if (!dto) {
			return;
		}
		// TypeØmatica boxes guarded primitives — unwrap before using the
		// value as a Map key or JSON payload (a boxed String serializes as
		// an object of char indices)
		const requestId = dto.requestId.valueOf();

		// The comparator. Snapshot BEFORE finalize: getConstructedFields
		// returns a copy, and finalize itself adds the re-guarded fields to
		// the record — the report must show the pre-finalize state.
		const constructed = getConstructedFields(dto);
		const hidden = Reflect.ownKeys(dto).filter((key): key is string => {
			const result = typeof key === 'string' && !constructed.has(key);
			return result;
		});

		// Right here the hidden fields are plain data properties: a
		// wrong-typed write would be silently accepted. Re-guard them.
		finalize(dto);

		// The proof the guard is real: a wrong-typed write now throws.
		let proofAfterFinalize: string;
		try {
			(dto as unknown as Record<string, unknown>).total = 'not a number';
			proofAfterFinalize = 'WRONG: silently accepted';
		} catch (error) {
			proofAfterFinalize = `threw: ${(error as Error).message}`;
		}

		const report: StrictReport = {
			requestId,
			constructedFields  : [...constructed].map(String),
			hiddenFields       : hidden,
			finalized          : isFinalized(dto),
			proofAfterFinalize,
			values             : {
				// guarded primitives are boxed by design; read via valueOf
				title : String(dto.title),
				total : Number(dto.total),
			},
			capturedAt         : new Date().toISOString(),
		};
		reports.set(requestId, report);
	});
}

export function readStrictReport (requestId: string): StrictReport | undefined {
	const result = reports.get(requestId);
	return result;
}
