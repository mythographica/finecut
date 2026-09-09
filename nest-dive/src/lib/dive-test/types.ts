/**
 * DiveTestEntity — mnemonica type for end-to-end dive context test.
 *
 * Defined on defaultTypes so attachHooks(defaultTypes) in app.module.ts
 * auto-wraps instance methods via postCreation hook.
 */
import { defaultTypes } from 'mnemonica/module';

// `type`, not `interface`: tactica's analyzer expands type aliases into
// .tactica/registry.ts, but emits bare interface names it cannot resolve.
export type DiveTestEntityData = {
	uuid : string;
	value : unknown;
};

export const DiveTestEntity = defaultTypes.define('DiveTestEntity', function (
	this : DiveTestEntityData & { process : () => Promise<void> },
	data : DiveTestEntityData
) {
	this.uuid = data.uuid;
	this.value = data.value;
});

// Prototype method — wrapped automatically by dive's method wrapping
// when attachHooks(defaultTypes) fires on postCreation.
DiveTestEntity.prototype.process = async function (this : DiveTestEntityData) {
	const { doWork } = await import('./worker.js');
	await doWork(this);
};
