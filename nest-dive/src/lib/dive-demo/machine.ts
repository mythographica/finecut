/**
 * Machine — the async work the demo entity goes through before it fails.
 *
 * Every step is an explicit wrap() boundary, so each becomes a named 'call'
 * edge in the instance's flow branch. The crash itself is scheduled on a
 * fresh macrotask and deliberately NOT awaited by the calling chain: the
 * error must escape to process level (that is the feature under demo), and
 * the wrap() edge it crosses is what pins the instance onto the error.
 */
import { wrap } from '@mnemonica/dive';

const tick = (ms : number) : Promise<void> => new Promise<void>((resolve) => {
	setTimeout(wrap(() => {
		resolve();
	}), ms);
});

/**
 * Schedule the process-level failure.
 * - 'sync'  → throw inside a wrap() edge           → uncaughtException
 * - 'async' → Promise.reject inside a wrap() edge,
 *             returned and left unhandled          → unhandledRejection
 * Both self-pin `instance` as the error crosses the wrap() boundary.
 */
function scheduleCrash (instance : object) : void {
	const inst = instance as Record<string, unknown>;
	const uuid = String(inst.uuid);

	if (inst.mode === 'async') {
		const crashAsync = wrap(function crashAsync () {
			const rejection = Promise.reject(
				new Error(`crash-demo unhandled rejection: ${uuid}`)
			);
			return rejection;
		}, instance);
		setImmediate(crashAsync);
		return;
	}

	const crashSync = wrap(function crashSync () {
		throw new Error(`crash-demo uncaught exception: ${uuid}`);
	}, instance);
	setImmediate(crashSync);
}

/**
 * Run two named steps (validate, transform) — each a flow edge — then
 * schedule the escape. Returns normally; the failure surfaces via
 * process.on('uncaughtException' | 'unhandledRejection'), not this promise.
 */
export async function execute (instance : object) : Promise<void> {
	const validate = wrap(async function validate () {
		await tick(5);
	}, instance);
	await validate();

	const transform = wrap(async function transform () {
		await tick(5);
	}, instance);
	await transform();

	scheduleCrash(instance);
}
