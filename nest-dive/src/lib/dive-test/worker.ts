/**
 * Worker — second file (dependency) with for/await loop + setTimeout steps.
 *
 * Called from DiveTestEntity.process() which is dive-wrapped,
 * so the entire execution chain carries the instance context.
 */
import { wrap } from '@mnemonica/dive';
import { pushToQueue } from './queue.js';

/**
 * Async generator yielding steps with setTimeout delays.
 * Each setTimeout callback is dive-wrapped so context survives.
 */
async function* steps () {
	for (let i = 0; i < 5; i++) {
		await new Promise<void>((resolve) => {
			setTimeout(wrap(() => {
				resolve();
			}), 10);
		});
		yield i;
	}
}

/**
 * Process the instance through 5 async steps.
 * Step 3 pushes the instance to the global queue.
 */
export async function doWork (instance : object) : Promise<void> {
	for await (const step of steps()) {
		if (step === 3) {
			pushToQueue(instance);
		}
	}
}
