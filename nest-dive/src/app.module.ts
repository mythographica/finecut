/**
 * AppModule — Root module for FineCut NestJS.
 *
 * Wires up MnemonicaModule, FrontendModule, EngineModule, and AdminModule.
 * Hook registration happens here, identical to finecutnode/src/core/server.ts.
 */
import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { MnemonicaModule, attachHooks } from '@mnemonica/nestjs';
import { defaultTypes, utils } from 'mnemonica/module';
import { getProps } from 'mnemonica';
import { current, getErrorInstance, getFlow } from '@mnemonica/dive';
import { reportProcessError } from './lib/process-error-spans.js';
import { FrontendModule } from './frontend/frontend.module.js';
import { EngineModule } from './engine/engine.module.js';
import { AdminModule } from './admin/admin.module.js';
import { FullBundleModule } from './lib/full-bundle/full-bundle.module.js';
import { ProofModule } from './lib/dive-proof/proof.module.js';
import { writeStaticCache } from './plugins/static-cache.js';
import { pushToDlq } from './lib/dive-stress/dlq.js';
import { formatChainTrace, traceChain } from './lib/chainTrace.js';

@Module({
	imports: [
		// trace.getTracer is a no-op until the SDK registers (src/tracing.ts),
		// so tests pay nothing; live runs span every dive-wrapped call,
		// nested under the HTTP request span at the boundary.
		MnemonicaModule.forRoot({
			autoExtract    : true,
			tracer         : trace.getTracer('finecut-nest-dive'),
			traceDiveCalls : true,
		}),
		FrontendModule,
		EngineModule,
		AdminModule,
		FullBundleModule,
		ProofModule,
	],
})
export class AppModule implements OnModuleInit {
	private readonly logger = new Logger(AppModule.name);

	onModuleInit () {
		// Validate page data before creation — controlled execution flow
		defaultTypes.registerHook('preCreation', (hookData) => {
			if (hookData.TypeName === 'PageData') {
				const args = hookData.args[0] as Record<string, unknown> | undefined;
				const pagePath = args?.path as string | undefined;
				if (!pagePath || typeof pagePath !== 'string') {
					throw new Error('PageData requires a valid path');
				}
			}
		});

		// Wire up static cache write hook — automatically cache successful responses
		defaultTypes.registerHook('postCreation', (hookData) => {
			if (hookData.TypeName === 'ResponseData') {
				const instance = hookData.inheritedInstance as Record<string, unknown> | undefined;
				const fromCache = instance?.fromCache;
				const statusCode = instance?.statusCode;
				if (instance && !fromCache && statusCode === 200) {
					writeStaticCache(
						String(instance.pagePath || ''),
						String(instance.body || '')
					).catch((err: Error) => {
						this.logger.error({ err: err.message }, 'static cache write failed');
					});
				}
			}
		});

		// Attach @mnemonica/dive hooks — context shifts to newest instance on each
		// creation. The pre-root feed is NOT global here: the FullBundle demo
		// wires it per-controller via the mti shortcut.
		attachHooks(defaultTypes);
		this.logger.log('Mnemonica hooks registered, dive attached');

		// ── uncaughtException handler ──
		process.on('uncaughtException', (err) => {
			const diveInstance = getErrorInstance(err);

			// Jaeger: root error span carrying the stack. The dive attributes
			// cross-reference the failed instance — /engine/dive-crash-report?uuid=...
			// holds the data Jaeger cannot represent.
			const spanAttributes: Record<string, string> = {};
			if (diveInstance) {
				const inst = diveInstance as Record<string, unknown>;
				if (inst.uuid) {
					spanAttributes[ 'dive.instance.uuid' ] = String(inst.uuid);
				}
				try {
					const typeName = getProps(diveInstance)?.__type__?.TypeName;
					if (typeName) {
						spanAttributes[ 'dive.instance.type' ] = String(typeName);
					}
				} catch { /* plain object without props */ }
				try {
					// The Why: construction steps with their arguments (data flow),
					// the data the failed instance carried, and the dive flow branch.
					const chainSteps = traceChain(diveInstance);
					spanAttributes[ 'mnemonica.chain' ] = formatChainTrace(chainSteps);
					spanAttributes[ 'mnemonica.instance.data' ] = JSON.stringify(utils.extract(diveInstance));
					const flowBranch = getFlow(err)
						.map((edge) => `${edge.kind}:${edge.name}:${edge.status}`)
						.join(' → ');
					spanAttributes[ 'mnemonica.flow' ] = flowBranch;
				} catch { /* enrichment must never crash a dying handler */ }
			}
			reportProcessError(err, 'uncaughtException', spanAttributes);

			if (diveInstance) {
				const inst = diveInstance as Record<string, unknown>;
				pushToDlq({
					requestId : String(inst.requestId || 'unknown'),
					uuid      : String(inst.uuid || 'unknown'),
					instance  : diveInstance,
					errorType : 'sync-throw',
				});
			}

			// Detailed console report (always)
			const props = getProps(err);
			const isMnemonicaInstance = props !== undefined;
			const errorTypeName = props?.__type__?.TypeName ?? null;
			const diveCtx = current();
			const diveCtxTypeName = (() => {
				if (!diveCtx) return null;
				try {
					return getProps(diveCtx)?.__type__?.TypeName ?? null;
				} catch {
					return null;
				}
			})();

			// eslint-disable-next-line no-console
			console.error('\n========== DIVE UNCAUGHT EXCEPTION REPORT ==========');
			// eslint-disable-next-line no-console
			console.error('error.message        :', err.message);
			// eslint-disable-next-line no-console
			console.error('error.isMnemonica    :', isMnemonicaInstance);
			// eslint-disable-next-line no-console
			console.error('error.TypeName       :', errorTypeName);
			// eslint-disable-next-line no-console
			console.error('dive.current         :', diveCtxTypeName || 'undefined');
			// eslint-disable-next-line no-console
			console.error('dive.errorInstance   :', diveInstance ? 'matched' : 'none');
			if (diveInstance) {
				const inst = diveInstance as Record<string, unknown>;
				// eslint-disable-next-line no-console
				console.error('dive.instance.uuid   :', inst.uuid);
				// eslint-disable-next-line no-console
				console.error('dive.instance.value  :', inst.value);
			}
			// eslint-disable-next-line no-console
			console.error('error.stack (first 3):');
			// eslint-disable-next-line no-console
			console.error(err.stack?.split('\n').slice(0, 4).join('\n'));
			// eslint-disable-next-line no-console
			console.error('========== END DIVE REPORT ==========\n');

			// For stress test: stay alive on dive-pinned errors so queue can continue.
			// Only exit on non-dive errors.
			if (!diveInstance) {
				process.exit(1);
			}
		});

		// ── unhandledRejection handler ──
		process.on('unhandledRejection', (reason) => {
			if (!(reason instanceof Error)) return;

			const diveInstance = getErrorInstance(reason);

			// Jaeger: root error span, same shape as the uncaughtException one
			const spanAttributes: Record<string, string> = {};
			if (diveInstance) {
				const inst = diveInstance as Record<string, unknown>;
				if (inst.uuid) {
					spanAttributes[ 'dive.instance.uuid' ] = String(inst.uuid);
				}
				try {
					const typeName = getProps(diveInstance)?.__type__?.TypeName;
					if (typeName) {
						spanAttributes[ 'dive.instance.type' ] = String(typeName);
					}
				} catch { /* plain object without props */ }
				try {
					// The Why: construction steps with their arguments (data flow),
					// the data the failed instance carried, and the dive flow branch.
					const chainSteps = traceChain(diveInstance);
					spanAttributes[ 'mnemonica.chain' ] = formatChainTrace(chainSteps);
					spanAttributes[ 'mnemonica.instance.data' ] = JSON.stringify(utils.extract(diveInstance));
					const flowBranch = getFlow(reason)
						.map((edge) => `${edge.kind}:${edge.name}:${edge.status}`)
						.join(' → ');
					spanAttributes[ 'mnemonica.flow' ] = flowBranch;
				} catch { /* enrichment must never crash a dying handler */ }
			}
			reportProcessError(reason, 'unhandledRejection', spanAttributes);

			if (diveInstance) {
				const inst = diveInstance as Record<string, unknown>;
				pushToDlq({
					requestId : String(inst.requestId || 'unknown'),
					uuid      : String(inst.uuid || 'unknown'),
					instance  : diveInstance,
					errorType : 'unhandled-rejection',
				});
			}

			// eslint-disable-next-line no-console
			console.error('\n========== DIVE UNHANDLED REJECTION REPORT ==========');
			// eslint-disable-next-line no-console
			console.error('reason.message       :', reason.message);
			// eslint-disable-next-line no-console
			console.error('dive.errorInstance   :', diveInstance ? 'matched' : 'none');
			if (diveInstance) {
				const inst = diveInstance as Record<string, unknown>;
				// eslint-disable-next-line no-console
				console.error('dive.instance.uuid   :', inst.uuid);
			}
			// eslint-disable-next-line no-console
			console.error('========== END REJECTION REPORT ==========\n');
		});
	}
}
