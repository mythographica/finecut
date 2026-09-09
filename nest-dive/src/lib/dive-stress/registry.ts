/**
 * Global registry for dive stress test instances.
 *
 * Instances are randomly shuffled and a subset is registered.
 * The queue picks randomly from this registry over time.
 */
const globalRegistry : object[] = [];

/**
 * Fisher-Yates shuffle, then register a random subset (default 70%).
 */
export function registerInstances (
	instances : object[],
	subsetRatio = 0.7
) : number {
	const shuffled = [...instances];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	const count = Math.max(1, Math.floor(shuffled.length * subsetRatio));
	const subset = shuffled.slice(0, count);
	globalRegistry.push(...subset);
	return subset.length;
}

/**
 * Pick a random instance from the registry and remove it.
 */
export function pickRandom () : object | undefined {
	if (globalRegistry.length === 0) return undefined;
	const idx = Math.floor(Math.random() * globalRegistry.length);
	return globalRegistry.splice(idx, 1)[0];
}

export function registrySize () : number {
	return globalRegistry.length;
}
