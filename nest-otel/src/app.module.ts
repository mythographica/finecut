/**
 * AppModule — Root module for FineCut NestJS.
 *
 * Wires up MnemonicaModule, FrontendModule, EngineModule, and AdminModule.
 * Hook registration happens here, identical to finecutnode/src/core/server.ts.
 */
import {
	Module, OnModuleInit, Logger, MiddlewareConsumer,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { MnemonicaModule } from '@mnemonica/nestjs';
import { defaultTypes } from 'mnemonica/module';
import { attachObservability } from './tracing.js';
import { RequestScopeMiddleware } from './request-scope.middleware.js';
import { UnblindExceptionFilter } from './unblind-exception.filter.js';
import { FrontendModule } from './frontend/frontend.module.js';
import { EngineModule } from './engine/engine.module.js';
import { AdminModule } from './admin/admin.module.js';
import { writeStaticCache } from './plugins/static-cache.js';

@Module({
	imports: [
		MnemonicaModule.forRoot({ autoExtract: true }),
		FrontendModule,
		EngineModule,
		AdminModule,
	],
	providers: [
		// Global exception boundary: the Unblinder report + telemetry for
		// anything escaping a controller (see the filter file for why).
		{
			provide : APP_FILTER,
			useClass : UnblindExceptionFilter,
		},
	],
})
export class AppModule implements OnModuleInit {
	private readonly logger = new Logger(AppModule.name);

	// Request scope: every request runs inside runInRequestScope — one
	// 'HTTP {method} {url}' span plus the triple async scope (see the
	// middleware file for the full story).
	configure (consumer: MiddlewareConsumer): void {
		consumer.apply(RequestScopeMiddleware).forRoutes('*');
	}

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

		// Wire the full observability stack: dive lifecycle edges, construction
		// spans, dive-edge spans, and the ALS async-flow backbone. Once per
		// process — AFTER the registerHook calls above.
		attachObservability(defaultTypes);

		this.logger.log('Mnemonica hooks registered');
	}
}
