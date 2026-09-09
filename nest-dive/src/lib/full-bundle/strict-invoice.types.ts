/**
 * StrictInvoice — the class-fields gap, made visible.
 *
 * A TypeØmatica strict class with NATIVE class fields (`target: ES2022`,
 * so useDefineForClassFields is on). Class-field initializers install with
 * [[Define]] semantics: they land as plain own data properties and NEVER
 * pass through the strict proxy's set trap — so `title` and `total` accept
 * any garbage silently until somebody re-guards them. `requestId`, assigned
 * in the constructor body, goes through the set trap and is tracked.
 *
 * StrictInvoiceEntity is the mnemonica carrier: constructing it builds the
 * DTO and fills it from outside (exactly what Nest's class-transformer does
 * to DTOs). The comparator + finalize then run in the postCreation hook —
 * see ./strict-report.ts.
 */
import { BaseClass } from 'typeomatica';
import { defaultTypes } from 'mnemonica/module';

export class StrictInvoice extends BaseClass {
	title = 'untitled';
	total = 0;
	declare requestId: string;

	constructor (requestId: string) {
		super();
		this.requestId = requestId;
	}
}

// `type`, not `interface`: tactica's analyzer expands type aliases into
// .tactica/registry.ts, but emits bare names it cannot resolve. Keep the
// alias self-contained: no intersections, and no class references (the dto
// is typed structurally — StrictInvoice is structurally compatible).
export type StrictInvoiceEntityData = {
	requestId : string;
	title     : string;
	total     : number;
};

export type StrictInvoiceEntityInstance = {
	dto : {
		requestId : string;
		title     : string;
		total     : number;
	};
};

export const StrictInvoiceEntity = defaultTypes.define('StrictInvoiceEntity', function (
	this : StrictInvoiceEntityInstance,
	data : StrictInvoiceEntityData
) {
	const dto = new StrictInvoice(data.requestId);
	// Outside-in fulfillment: these writes hit the class fields' own data
	// properties directly — no type check happens here. That silence IS the
	// gap this demo exposes.
	dto.title = data.title;
	dto.total = data.total;
	this.dto = dto;
});
