/**
 * Mnemonica chain tracing utilities.
 * Reconstructs the execution path from any instance in the chain.
 */
import { getProps } from 'mnemonica';

export interface ChainStep {
	TypeName   : string;
	timestamp  : number;
	args       : unknown[];
	properties : Record<string, unknown>;
}

/**
 * Walk up the mnemonica parent chain and collect every step.
 * Returns array from root (RequestData) to leaf (current instance).
 */
export function traceChain (instance: object): ChainStep[] {
	const steps: ChainStep[] = [];

	function walk (current: object): void {
		const props = getProps(current);
		if (!props) return;

		const {
			__type__: type,
			__args__: args,
			__timestamp__: timestamp,
			__parent__: parent
		} = props as Record<string, unknown>;

		const typeName = (type as Record<string, unknown>)?.TypeName as string | undefined;
		if (!typeName) return;

		// Collect enumerable properties (skip internal mnemonica props)
		const properties: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(current)) {
			if (!key.startsWith('__') && typeof value !== 'function') {
				properties[key] = value;
			}
		}

		steps.unshift({
			TypeName   : typeName,
			timestamp  : (timestamp as number) || 0,
			args       : (args as unknown[]) || [],
			properties
		});

		if (parent && typeof parent === 'object') {
			walk(parent);
		}
	}

	walk(instance);
	return steps;
}

/**
 * Format chain steps into a human-readable trace string.
 */
export function formatChainTrace (steps: ChainStep[]): string {
	return steps.map((step, i) => {
		const indent = '  '.repeat(i);
		const args = step.args.length > 0
			? JSON.stringify(step.args[0]).slice(0, 120)
			: '{}';
		return `${indent}${step.TypeName} (${args})`;
	}).join('\n');
}

/**
 * Extract requestId from a chain by looking at the root RequestData step.
 */
export function getRequestId (instance: object): string | undefined {
	const steps = traceChain(instance);
	const root = steps[0];
	if (!root) return undefined;
	return root.properties.requestId as string | undefined;
}
