/**
 * ProofEntity — mnemonica type for the queue-attribution proof.
 *
 * Each instance carries a numeric marker and the outcome it SHOULD produce
 * ('ok' | 'fail'). process() waits a random delay, then either returns its
 * own data or throws — the "delayed processing" shape of the 2016 incident:
 * by the time the failure surfaces, the originating request is long gone.
 */
import { defaultTypes } from 'mnemonica/module';

// `type`, not `interface`: tactica's analyzer expands type aliases into
// .tactica/registry.ts, but emits bare interface names it cannot resolve.
export type ProofExpectation = 'ok' | 'fail';

export type ProofData = {
	uuid   : string;
	marker : number;
	expect : ProofExpectation;
};

export type ProofResult = {
	uuid        : string;
	marker      : number;
	processedAt : number;
};

export const ProofEntity = defaultTypes.define('ProofEntity', function (
	this : ProofData & { process : () => Promise<ProofResult> },
	data : ProofData
) {
	this.uuid = data.uuid;
	this.marker = data.marker;
	this.expect = data.expect;
});

// Prototype method — wrapped automatically by dive's method wrapping
// when attachHooks(defaultTypes) fires on postCreation. The random delay
// INSIDE the wrapped method is what makes attribution non-trivial: the
// outcome lands long after the request/response cycle has moved on.
ProofEntity.prototype.process = async function (this : ProofData) : Promise<ProofResult> {
	const delay = 10 + Math.floor(Math.random() * 80);
	await new Promise<void>((resolve) => {
		setTimeout(resolve, delay);
	});
	if (this.expect === 'fail') {
		throw new Error(`proof failure for marker ${this.marker}`);
	}
	const result : ProofResult = {
		uuid        : this.uuid,
		marker      : this.marker,
		processedAt : Date.now(),
	};
	return result;
};
