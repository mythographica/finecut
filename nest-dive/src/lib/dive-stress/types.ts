/**
 * Mnemonica types for dive stress test.
 *
 * StressEntity     : parent type with uuid, requestId, value
 * StressEntityChild: sub-type that throws when forceError is passed
 *
 * attachHooks(defaultTypes) in app.module.ts auto-wraps instance methods
 * via postCreation hook — no manual wrapInstanceMethods needed.
 */
import { defaultTypes } from 'mnemonica/module';

// `type`, not `interface`: tactica's analyzer expands type aliases into
// .tactica/registry.ts, but emits bare interface names it cannot resolve.
export type StressData = {
	uuid      : string;
	requestId : string;
	value     : unknown;
};

export const StressEntity = defaultTypes.define('StressEntity', function (
	this : StressData,
	data : StressData
) {
	this.uuid = data.uuid;
	this.requestId = data.requestId;
	this.value = data.value;
});

export const StressChild = StressEntity.define('StressChild', function (
	this : { childData: unknown },
	data : { forceError?: boolean }
) {
	if (data.forceError) {
		throw new Error('forced child construction error');
	}
	this.childData = data;
});
