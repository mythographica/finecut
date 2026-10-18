/**
 * Express 5 server bootstrap.
 * Mirrors finecutnode/src/core/server.ts — same logic, Express instead of Fastify.
 */
// tracing must load first: it registers the tracer provider before any
// mnemonica construction or dive-wrapped call happens
import {
	reportProcessError,
	flushTracing,
	attachObservability,
	unblind,
	tracer,
	otel,
	asyncFlow,
} from '../tracing.js';
import express, { type NextFunction, type Request, type Response } from 'express';
import { lookup } from 'mnemonica/module';
import type { hooksOpts } from 'mnemonica/module';
import './collections/requestTypes.js';
import './collections/engineTypes.js';
import { defaultTypes } from 'mnemonica/module';
import {
	runInEntryScope,
	feedPreRoot,
} from '@mnemonica/otel';
import { wrap } from '@mnemonica/dive';
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

const app = express();

// Parse JSON and form-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request scope: one 'HTTP {method} {route}' span per request, the
// thunderstruck pre-root feed (payloads correlated by object identity),
// and the triple async scope (provider ALS + OTEL global context +
// async-flow root frame) around everything downstream.
app.use((req: Request, res: Response, next: NextFunction) => {
	feedPreRoot({
		method  : req.method,
		url     : req.url,
		params  : req.params,
		query   : req.query,
		body    : req.body,
		headers : req.headers,
	});
	// the caller owns the ending: the span closes on response 'finish'
	runInEntryScope({
		name        : `HTTP ${req.method} ${req.route?.path ?? req.url}`,
		attributes  : {
			'http.method' : req.method,
			'http.url'    : req.url,
		},
		endOnReturn : false,
	}, { tracer, otel, asyncFlow }, (span) => {
		res.on('finish', () => {
			span.setAttribute('http.status_code', res.statusCode);
			span.end();
		});
		next();
	});
});

// Wire up mnemonica collection hooks to Pino (default collection)
setupCollectionLogging(defaultTypes, logger);

// Wire the full observability stack: dive lifecycle edges, construction
// spans, dive-edge spans, and the ALS async-flow backbone. Once per process.
attachObservability(defaultTypes);

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
			// Detach point: this promise outlives the construction frame, so it
			// is wrapped WITH the instance — its async hops (and any failure)
			// stay attributed to the ResponseData that caused them.
			const writeCache = wrap(
				() => writeStaticCache(instance.pagePath || '', instance.body || ''),
				instance
			);
			writeCache().catch((err: Error) => {
				logger.error({ err: err.message }, 'static cache write failed');
			});
		}
	}
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
	res.json({ status: 'ok', mnemonica: true });
});

// Test endpoint: verify mnemonica chain works
app.get('/test-chain', (_req: Request, res: Response) => {
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

	res.status(responseData.statusCode)
		.type(responseData.contentType)
		.send(responseData.body);
});

// Register admin API routes first (before frontend catch-all)
import settingsRouter from '../routes/engine/settings.js';
app.use(settingsRouter);

import treePagesRouter from '../routes/engine/tree_pages.js';
app.use(treePagesRouter);

import templateRouter from '../routes/engine/template.js';
app.use(templateRouter);

import templateActionRouter from '../routes/engine/template_action.js';
app.use(templateActionRouter);

import apiRouter from '../routes/engine/api.js';
app.use(apiRouter);

import adminRouter from '../routes/engine/admin.js';
app.use(adminRouter);

// Register frontend page route LAST (catch-all)
import frontendRouter from '../routes/frontend.js';
app.use(frontendRouter);

// Error boundary: anything that escaped a route lands here. The
// Unblinder report carries the analysed dive chain + errored construction
// + attempted args; the analysis rides the request span as a
// 'mnemonica.error' event and the '[unblind]' stdout marker.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
	const report = unblind(err);
	logger.error({ err: err.message }, 'unhandled route error');
	if (!res.headersSent) {
		res.status(500).json(report);
	}
});

const PORT = Number(process.env.PORT) || 3003;

// Start the server if this file is run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
	app.listen(PORT, '0.0.0.0', () => {
		logger.info(`FineCut-Express listening on http://0.0.0.0:${PORT}`);
	});
}

export { app, logger, PORT };
