/**
 * Fastify server bootstrap.
 */
// tracing must load first: it patches http/fastify at import time
import { reportProcessError, flushTracing } from '../tracing.js';
import Fastify from 'fastify';
import fastifyFormbody from '@fastify/formbody';
import { lookup } from 'mnemonica';
import type { hooksOpts } from 'mnemonica';
import {
	RouteData, PageData, RenderData, ResponseData
} from './collections/requestTypes.js';
import {
	EngineRequest, TreeResult, PageResult, CacheResult, TemplateResult
} from './collections/engineTypes.js';
import { defaultTypes } from 'mnemonica';
import { createLogger, setupCollectionLogging } from '../plugins/pino-logger.js';
import { writeStaticCache } from '../plugins/static-cache.js';

// Process-level failures → Jaeger error span, then exit (standard pattern):
// an uncaught error leaves the process in undefined state — report, flush, die.
process.on('uncaughtException', async (err) => {
	reportProcessError(err, 'uncaughtException');
	console.error(err);
	await flushTracing();
	process.exit(1);
});
process.on('unhandledRejection', async (reason) => {
	if (reason instanceof Error) {
		reportProcessError(reason, 'unhandledRejection');
		console.error(reason);
		await flushTracing();
	}
	process.exit(1);
});

// Instance shape accessed by the static-cache postCreation hook
type ResponseLike = {
	fromCache?: boolean;
	statusCode?: number;
	pagePath?: string;
	body?: string;
};

const logger = createLogger();

const RequestData = lookup('RequestData');

const app = Fastify({
	loggerInstance : logger
});

// Parse form-encoded bodies (jQuery $.ajax default)
await app.register(fastifyFormbody);

// Wire up mnemonica collection hooks to Pino (default collection)
setupCollectionLogging(defaultTypes, logger);

// Validate page data before creation — controlled execution flow
defaultTypes.registerHook('preCreation', (hookData) => {
	if (hookData.TypeName === 'PageData') {
		const args = hookData.args[0] as Record<string, unknown> | undefined;
		const path = args?.path as string | undefined;
		if (!path || typeof path !== 'string') {
			throw new Error('PageData requires a valid path');
		}
	}
});

// Wire up static cache write hook — automatically cache successful responses
defaultTypes.registerHook('postCreation', (hookData: hooksOpts<ResponseLike>) => {
	if (hookData.TypeName === 'ResponseData') {
		const instance = hookData.inheritedInstance;
		const fromCache = instance?.fromCache;
		const statusCode = instance?.statusCode;
		if (instance && !fromCache && statusCode === 200) {
			writeStaticCache(instance.pagePath || '', instance.body || '').catch((err: Error) => {
				logger.error({ err: err.message }, 'static cache write failed');
			});
		}
	}
});

// Decorate Fastify with mnemonica constructors for route access
app.decorate('RequestData', RequestData);
app.decorate('RouteData', RouteData);
app.decorate('PageData', PageData);
app.decorate('RenderData', RenderData);
app.decorate('ResponseData', ResponseData);

app.decorate('EngineRequest', EngineRequest);
app.decorate('TreeResult', TreeResult);
app.decorate('PageResult', PageResult);
app.decorate('CacheResult', CacheResult);
app.decorate('TemplateResult', TemplateResult);

// Health check
app.get('/health', async () => {
	return { status : 'ok', mnemonica : true };
});

// Test endpoint: verify mnemonica chain works
app.get('/test-chain', async (_req, reply) => {
	const requestData = new RequestData({
		method  : 'GET',
		url     : '/test',
		query   : {},
		params  : {},
		body    : {},
		headers : {},
		id      : 'test'
	});
	const routeData = new requestData.RouteData({
		pagePath : '/test',
		isMain   : false,
		deep     : ''
	});
	const pageData = new routeData.PageData({
		header : {
			title       : 'Test',
			template    : 'default',
			pageIsCode  : false,
			keywords    : '',
			description : '',
			additional  : ''
		},
		content : 'Hello from mnemonica chain',
		info    : {},
		blocks  : [],
		path    : '/test'
	});
	const renderData = new pageData.RenderData({ parser : 'test' });
	const responseData = new renderData.ResponseData({
		body : JSON.stringify({}),
		contentType : 'application/json',
		statusCode : 200,
		fromCache : false
	});

	return reply
		.type(responseData.contentType)
		.code(responseData.statusCode)
		.send(responseData.body);
});

// Register admin API routes first (before frontend catch-all)
const { default : registerSettings } = await import('../routes/engine/settings.js');
await registerSettings(app);

const { default : registerTreePages } = await import('../routes/engine/tree_pages.js');
await registerTreePages(app);

const { default : registerTemplate } = await import('../routes/engine/template.js');
await registerTemplate(app);

const { default : registerTemplateAction } = await import('../routes/engine/template_action.js');
await registerTemplateAction(app);

const { default : registerApi } = await import('../routes/engine/api.js');
await registerApi(app);

const { default : registerAdmin } = await import('../routes/engine/admin.js');
await registerAdmin(app);

// Register frontend page route LAST (catch-all)
const { default : registerFrontend } = await import('../routes/frontend.js');
await registerFrontend(app);

const PORT = Number(process.env.PORT) || 3000;

// Start the server if this file is run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
	app.listen({ port: PORT, host: '0.0.0.0' })
		.then(() => {
			logger.info(`FineCut server listening on http://0.0.0.0:${PORT}`);
		})
		.catch((err: Error) => {
			logger.error(err);
			process.exit(1);
		});
}

export { app, logger, PORT };
