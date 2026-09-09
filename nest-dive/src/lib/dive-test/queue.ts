/**
 * Queue — third file (dependency) with global store + setInterval consumer.
 *
 * Pushed items carry a dive-wrapped runner that restores the originating
 * instance's context when executed. On validation failure the throw crosses
 * the wrap() boundary, so the error self-pins the instance — the
 * uncaughtException handler reads it back with getErrorInstance.
 */
import { wrap } from '@mnemonica/dive';

interface QueueItem {
	instance : object;
	run : () => void;
}

const queue : QueueItem[] = [];

/**
 * Push an instance to the queue.
 * The runner is wrapped with the instance as explicit dive context, so when
 * the setInterval consumer calls it, the instance context is restored — and
 * a validation throw self-pins the instance on the error.
 */
export function pushToQueue (instance : object) : void {
	queue.push({
		instance,
		run: wrap(() => {
			const inst = instance as Record<string, unknown>;
			const value = inst.value;

			if (typeof value !== 'number' || value < 1 || value > 10) {
				const err = new Error(
					`validation failed: expected number 1-10, got: ${String(value)} (type: ${typeof value})`
				);
				throw err;
			}
		}, instance)
	});
}

// Consumer: reads queue with setInterval.
// When item.run() throws, the error escapes to uncaughtException.
setInterval(() => {
	const item = queue.shift();
	if (!item) return;

	item.run();
}, 50);
