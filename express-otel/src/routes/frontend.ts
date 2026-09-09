/**
 * Frontend catch-all route.
 * Mnemonica chain: RequestData → RouteData → PageData → RenderData → ResponseData
 */
import path from 'path';
import { Router, type Request, type Response } from 'express';
import '../core/collections/requestTypes.js';
import { createLogger } from '../plugins/pino-logger.js';
import { lookup } from 'mnemonica/module';
import { wrap } from '@mnemonica/dive';
import { buildUnblindReport, recordUnblindTelemetry } from '@mnemonica/otel';
import { checkStaticCache } from '../plugins/static-cache.js';
import { fileExists, loadPageFiles } from '../lib/fileUtils.js';
import { render } from '../lib/templateEngine.js';
import {
	jsonInfo, headAdditional, contentParser, menuMain, menuLeft
} from '../lib/components.js';
import '../lib/registerHelpers.js';
import { settings } from '../core/settings.js';
import type { TemplateContext } from '../types/index.js';

const RequestData = lookup('RequestData');

const ROOT = process.cwd();

function parseUrl (url: string): string {
	let uri = decodeURIComponent(url);
	uri = uri.replace(/index\.(php|htm|html)/g, '');
	uri = uri.replace(/_index\/?/g, '');
	uri = uri.replace(/^\//, '').replace(/\/$/, '');
	return '/' + uri;
}

const router = Router();

// NOTE: Express 5 strips req.url when router.use(regex) matches.
// Use a plain middleware and check req.originalUrl instead.
router.use(async (req: Request, res: Response) => {
	// Skip static assets — BFF serves these, backend renders pages only
	if (path.extname(req.path)) {
		res.status(404).type('text/html').send('<h1>404 Not Found</h1>');
		return;
	}

	let pagePath = '';
	let chainInstance: object | undefined;

	try {
		const requestData = new RequestData({
			method  : req.method,
			url     : req.url,
			query   : req.query as Record<string, unknown>,
			params  : req.params as Record<string, unknown>,
			body    : req.body as Record<string, unknown>,
			headers : req.headers as Record<string, unknown>,
			id      : String(req.headers['x-request-id'] || Math.random().toString(36).slice(2))
		});
		chainInstance = requestData;

		pagePath = parseUrl(req.originalUrl || req.url);
		let isMain = false;

		if (pagePath === '/' || pagePath === '') {
			pagePath = '/_index';
			isMain = true;
		}

		const fullPagePath = path.join(ROOT, settings.pages, pagePath);

		if (!await fileExists(fullPagePath)) {
			res.status(404).type('text/html').send('<h1>404 Not Found</h1>');
			return;
		}

		const routeData = new requestData.RouteData({
			pagePath,
			isMain,
			deep : ''
		});
		chainInstance = routeData;

		// Sync-splits: free async services wrapped WITH the chain instance
		// they serve, so their call edges stitch into the request's branch
		// (contextless wraps would record lonely, unstitched edges).
		const pageFiles = await wrap(function loadPage () {
				return loadPageFiles(fullPagePath);
			}, routeData)();
		const pageData = new routeData.PageData(pageFiles);
		chainInstance = pageData;

		// Check static cache before rendering
		const cached = await wrap(function staticCache () {
				return checkStaticCache(pagePath, pageFiles.header);
			}, pageData)();
		if (cached) {
			const cachedRenderData = new pageData.RenderData({});
			const responseData = new cachedRenderData.ResponseData({
				body : cached,
				contentType : 'text/html',
				statusCode : 200,
				fromCache : true
			});
			res.status(responseData.statusCode)
				.type(responseData.contentType)
				.send(responseData.body);
			return;
		}

		// Resolve components (async ones wrapped with the page they build on)
		const components = {
			jsonInfo       : jsonInfo(pageData),
			headAdditional : headAdditional(),
			contentParser  : await wrap(function parseContent () {
				return contentParser(pageData);
				}, pageData)(),
			menuMain       : await wrap(function mainMenu () {
				return menuMain(pageData);
				}, pageData)(),
			menuLeft       : await wrap(function leftMenu () {
				return menuLeft(pageData);
				}, pageData)()
		};

		const renderData = new pageData.RenderData(components);
		chainInstance = renderData;
		const templatePath = path.join(
			ROOT, 'views', 'templates',
			renderData.template || 'default',
			'index.html'
		);

		const context: TemplateContext = {
			header     : renderData.header,
			content    : renderData.content,
			info       : renderData.info,
			blocks     : renderData.blocks,
			components : renderData.components as Record<string, string>,
			isMain     : renderData.isMain,
			deep       : renderData.deep,
			pagePath   : renderData.pagePath,
			path       : renderData.path
		};

		const html = await wrap(function renderTemplate () {
				return render(templatePath, context);
			}, renderData)();

		const responseData = new renderData.ResponseData({
			body : html,
			contentType : 'text/html',
			statusCode : 200,
			fromCache : false
		});
		chainInstance = responseData;

		res.status(responseData.statusCode)
			.type(responseData.contentType)
			.send(responseData.body);

	} catch (err) {
		const error = err as Error;
		routeLogger.error({ err: error.message, pagePath }, 'request failed');

		// The route's own error boundary: emit the Unblinder span + marker.
		// The dive branch and errored construction ride the error object.
		const report = buildUnblindReport(error);
		recordUnblindTelemetry(report, error);

		let displayError = error;
		if (chainInstance) {
			try {
				const instance = chainInstance as Record<string, unknown>;
				const exceptionCtor = instance.exception as (new (e: Error) => Error) | undefined;
				if (exceptionCtor) {
					displayError = new exceptionCtor(error);
				}
			} catch {
				// fallback to plain error
			}
		}

		res.status(500).type('text/html').send(
			'<h1>500 Internal Server Error</h1>' +
			`<pre>${displayError.message}</pre>`
		);
	}
});

const routeLogger = createLogger();
export default router;
