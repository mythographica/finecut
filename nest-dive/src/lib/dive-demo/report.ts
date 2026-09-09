/**
 * Report — the retrieval half of the crash-and-retrieve demo.
 *
 * Registers process-level listeners (once) that catch whatever escapes the
 * demo entity's execution chain. For each pinned error:
 *   - getErrorInstance(err)  → the exact mnemonica instance that failed
 *   - getProps(instance)     → its type and construction record
 *   - utils.extract(instance)→ the data it carried (uuid, payload, mode)
 *   - getFlow(err)           → the flight recorder: the branch that produced
 *                              the error, edge by edge
 *
 * Reports are stored by uuid so the HTTP layer can serve them after the
 * fact — the whole point: the process survives, and the failure is fully
 * inspectable over HTTP.
 */
import { getErrorInstance } from '@mnemonica/dive';
import { getProps, utils } from 'mnemonica/module';
import { formatFlow, type FormattedFlowEdge } from '@mnemonica/nestjs';

export type CrashReportFlowEdge = FormattedFlowEdge;

export type CrashReport = {
	uuid         : string;
	retrieved    : true;
	errorName    : string;
	errorMessage : string;
	instanceType : string | null;
	instanceData : Record<string, unknown>;
	flow         : CrashReportFlowEdge[];
	capturedAt   : string;
};

const reports = new Map<string, CrashReport>();

function typeNameOf (instance : object) : string | null {
	try {
		const result = getProps(instance)?.__type__?.TypeName ?? null;
		return result;
	} catch {
		return null;
	}
}

function capture (err : Error) : void {
	const instance = getErrorInstance(err);
	if (!instance) return;

	// only demo errors belong in this store — dive-stress & co. have their own
	if (typeNameOf(instance) !== 'CrashDemoEntity') return;

	const inst = instance as Record<string, unknown>;
	const uuid = String(inst.uuid || 'unknown');

	const flow = formatFlow(err);

	const report: CrashReport = {
		uuid,
		retrieved    : true,
		errorName    : err.name,
		errorMessage : err.message,
		instanceType : typeNameOf(instance),
		instanceData : utils.extract(instance) as Record<string, unknown>,
		flow,
		capturedAt   : new Date().toISOString(),
	};
	reports.set(uuid, report);
}

let armed = false;

/**
 * Attach the capture listeners. Idempotent — safe to call per request.
 * Listeners coexist with app.module's own uncaught handlers: every listener
 * runs, theirs logs + pushes to DLQ, ours records the retrievable report.
 */
export function armCrashCapture () : void {
	if (armed) return;
	armed = true;
	process.on('uncaughtException', (err) => {
		capture(err);
	});
	process.on('unhandledRejection', (reason) => {
		if (reason instanceof Error) {
			capture(reason);
		}
	});
}

export function readReport (uuid : string) : CrashReport | undefined {
	const result = reports.get(uuid);
	return result;
}
