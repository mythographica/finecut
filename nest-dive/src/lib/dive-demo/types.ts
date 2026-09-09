/**
 * CrashDemoEntity — mnemonica type for the crash-and-retrieve demo.
 *
 * Defined on defaultTypes so attachHooks(defaultTypes) in app.module.ts
 * records the 'create' flow edge and auto-wraps the prototype method.
 *
 * The demo's point: run() executes a couple of named steps and then lets an
 * error ESCAPE to process level (uncaughtException / unhandledRejection).
 * The report module (./report.js) then proves the failure can be traced back
 * to THIS exact instance — its data and its execution branch — after the fact.
 */
import { defaultTypes } from 'mnemonica/module';

// `type`, not `interface`: tactica's analyzer expands type aliases into
// .tactica/registry.ts, but emits bare interface names it cannot resolve.
export type CrashDemoEntityData = {
	uuid    : string;
	payload : string;
	mode    : 'sync' | 'async';
};

export const CrashDemoEntity = defaultTypes.define('CrashDemoEntity', function (
	this : CrashDemoEntityData & { run : () => Promise<void> },
	data : CrashDemoEntityData
) {
	this.uuid = data.uuid;
	this.payload = data.payload;
	this.mode = data.mode;
});

// Prototype method — wrapped automatically by dive's method wrapping
// when attachHooks(defaultTypes) fires on postCreation.
CrashDemoEntity.prototype.run = async function (this : CrashDemoEntityData) {
	const { execute } = await import('./machine.js');
	await execute(this);
};
