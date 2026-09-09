/**
 * InvoiceEntityAsync — the DEFINITION site of the unhandledRejection demo.
 *
 * The async twin of InvoiceEntity: the controller constructs it
 * fire-and-forget (no await), so when the domain invariant fails AFTER an
 * actual async hop, the rejection escapes every Nest boundary and surfaces
 * as a real process-level unhandledRejection. Core wraps the failure into an
 * errored mnemonica instance whose .stack is the same composite three
 * sections (definition HERE, creation at the controller, invocation in
 * ./guard.ts) and whose props carry the original construction args — the
 * very body object mti stamped, so Thunderstruck pre-root data stays
 * resolvable even though no instance ever came to be.
 */
import { defaultTypes } from 'mnemonica/module';
import { getPreRoot, type PreRootData } from '@mnemonica/nestjs';
import { assertInvoiceInvariant } from './guard.js';

// `type`, not `interface`: tactica's analyzer expands type aliases into
// .tactica/registry.ts, but emits bare names it cannot resolve — and an
// alias built by intersecting ANOTHER alias (InvoiceEntityData & {...}) is
// exactly such a case. Keep this alias self-contained.
export type InvoiceAsyncData = {
	requestId : string;
	title     : string;
	price     : number;
	quantity  : number;
	total     : number;
};

export type InvoiceAsyncInstance = InvoiceAsyncData & {
	preRoot?: PreRootData;
};

export const InvoiceEntityAsync = defaultTypes.define('InvoiceEntityAsync', async function (
	this : InvoiceAsyncInstance,
	data : InvoiceAsyncData
) {
	const preRoot = getPreRoot(data);
	if (preRoot !== undefined) {
		this.preRoot = preRoot;
	}
	// A real async hop: the invariant fails AFTER the construction has
	// suspended once, which is what makes the rejection unhandled-able.
	await new Promise<void>((resolve) => {
		setImmediate(resolve);
	});
	assertInvoiceInvariant(data);
	this.title = data.title;
	this.price = data.price;
	this.quantity = data.quantity;
	this.total = data.total;
	return this;
});
