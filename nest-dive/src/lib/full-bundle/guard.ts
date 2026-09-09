/**
 * Guard — the INVOCATION site of the full-bundle demo.
 *
 * A domain invariant class-validator cannot express: price × quantity must
 * equal the declared total. The mnemonica constructor invokes this, so when
 * it throws, the error's composite stack points HERE — a different file from
 * both the definition (invoice.types.ts) and the creation (the adapter's
 * pipe, which runs `new`).
 */
import type { InvoiceEntityData } from './invoice.types.js';

export function assertInvoiceInvariant (data: InvoiceEntityData): void {
	const expected = data.price * data.quantity;
	if (expected !== data.total) {
		throw new TypeError(
			`invoice "${data.title}" total ${data.total} does not match price × quantity (${expected})`
		);
	}
}
