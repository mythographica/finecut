/**
 * InvoiceEntity — the DEFINITION site of the full-bundle demo.
 *
 * The constructor does two demo-relevant things:
 *   1. Wires the Thunderstruck pre-root data of THIS request into the
 *      instance: getPreRoot(data) correlates by object identity — `data` is
 *      the same body object the mti interceptor stamped at the boundary.
 *   2. Invokes the domain invariant from ./guard.ts — which throws when
 *      price × quantity does not equal the total, producing core's composite
 *      error stack (definition / creation / invocation, three separate files).
 */
import { defaultTypes } from 'mnemonica/module';
import { getPreRoot, type PreRootData } from '@mnemonica/nestjs';
import { assertInvoiceInvariant } from './guard.js';

// `type`, not `interface`: tactica's analyzer expands type aliases into
// .tactica/registry.ts, but emits bare interface names it cannot resolve.
export type InvoiceEntityData = {
	title    : string;
	price    : number;
	quantity : number;
	total    : number;
};

export type InvoiceEntityInstance = InvoiceEntityData & {
	preRoot?: PreRootData;
};

export const InvoiceEntity = defaultTypes.define('InvoiceEntity', function (
	this : InvoiceEntityInstance,
	data : InvoiceEntityData
) {
	const preRoot = getPreRoot(data);
	if (preRoot !== undefined) {
		this.preRoot = preRoot;
	}
	assertInvoiceInvariant(data);
	this.title = data.title;
	this.price = data.price;
	this.quantity = data.quantity;
	this.total = data.total;
});
