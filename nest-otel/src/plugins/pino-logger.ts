/**
 * Pino logger configuration with mnemonica collection hook integration.
 *
 * Uses mnemonica's chain tracing to reconstruct the full execution path
 * on errors. Every log entry carries request correlation and chain depth.
 */
import pino from 'pino';
import type { TypesCollection, hooksOpts } from 'mnemonica';
import { traceChain, formatChainTrace, getRequestId } from '../lib/chainTrace.js';

// Common shape of mnemonica instances accessed in hooks
// Structural typing means any instance with these optional props matches
type HookInstance = {
	requestId?: string;
	fromCache?: boolean;
	statusCode?: number;
	pagePath?: string;
	body?: string;
	parse?: () => Record<string, unknown>;
};

export function createLogger () {
	return pino({
		level : process.env.LOG_LEVEL || 'info',
		transport: process.env.NODE_ENV !== 'production'
			? { target: 'pino-pretty', options: { colorize: true } }
			: undefined
	});
}

export function setupCollectionLogging (collection: TypesCollection, log: ReturnType<typeof createLogger>) {

	// Track timing per request for performance metrics
	const timings = new Map<string, number>();

	collection.registerHook('preCreation', (hookData: hooksOpts<HookInstance>) => {
		const requestId = hookData.existentInstance.requestId;

		if (requestId && hookData.TypeName === 'RequestData') {
			timings.set(requestId, performance.now());
		}

		log.info({
			event     : 'transform.start',
			TypeName  : hookData.TypeName,
			requestId,
			args      : hookData.args.length > 0
				? JSON.stringify(hookData.args[0]).slice(0, 200)
				: undefined
		}, 'starting transformation');
	});

	collection.registerHook('postCreation', (hookData: hooksOpts<HookInstance>) => {
		const requestId = hookData.inheritedInstance?.requestId;

		if (requestId && hookData.TypeName === 'ResponseData') {
			const start = timings.get(requestId);
			const duration = start ? performance.now() - start : undefined;
			timings.delete(requestId);

			log.info({
				event    : 'transform.end',
				TypeName : hookData.TypeName,
				requestId,
				duration : duration !== undefined ? Math.round(duration) : undefined
			}, 'transformation complete');
		} else {
			log.info({
				event    : 'transform.end',
				TypeName : hookData.TypeName,
				requestId
			}, 'transformation complete');
		}
	});

	collection.registerHook('creationError', (hookData: hooksOpts<HookInstance>) => {
		const existentInstance = hookData.existentInstance;
		const inheritedInstance = hookData.inheritedInstance;

		// The error is either inheritedInstance itself (if instanceof Error)
		// or we need to extract it from the failed creation
		const error = inheritedInstance instanceof Error
			? inheritedInstance
			: new Error('Unknown creation error');

		// Reconstruct the full chain up to the point of failure
		const chainSteps = traceChain(existentInstance);
		const requestId = getRequestId(existentInstance);
		const chainDepth = chainSteps.length;
		const chainTrace = formatChainTrace(chainSteps);

		// Try to parse the existentInstance for structural context
		// parse() returns { name, props, joint, parent, self }
		let instanceParse: Record<string, unknown> | undefined;
		try {
			const parseFn = existentInstance.parse;
			if (parseFn) {
				instanceParse = parseFn();
			}
		} catch {
			// parse() may throw for non-mnemonica instances
		}

		log.error({
			event       : 'transform.error',
			TypeName    : hookData.TypeName,
			requestId,
			chainDepth,
			error       : error.message,
			stack       : error.stack?.split('\n').slice(0, 5),
			chainTrace  : chainTrace.split('\n'),
			instanceName: instanceParse?.name,
			instanceProps: instanceParse?.props
		}, `transformation failed at step ${chainDepth}: ${hookData.TypeName}`);
	});
}
