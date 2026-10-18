/**
 * Frontend catch-all route.
 * Mnemonica chain: RequestData → RouteData → PageData → RenderData → ResponseData
 */
import path from 'path';
import type { FastifyRequest, FastifyReply } from 'fastify';
import '../core/collections/requestTypes.js';
import { lookup, utils } from 'mnemonica';
import { wrap } from '@mnemonica/dive';
import { unblind } from '../tracing.js';
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

type AppGet = {
	get: (
		path: string,
		handler: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>
	) => void;
};

export default async function (app: AppGet): Promise<void> {

	app.get('/*', async (req: FastifyRequest, reply: FastifyReply) => {
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
				id      : req.id as string
			});
			chainInstance = requestData;

			pagePath = parseUrl(req.url);
			let isMain = false;

			if (pagePath === '/' || pagePath === '') {
				pagePath = '/_index';
				isMain = true;
			}

			const fullPagePath = path.join(ROOT, settings.pages, pagePath);

			if (!await fileExists(fullPagePath)) {
				reply.code(404);
				return reply.type('text/html').send('<h1>404 Not Found</h1>');
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
				return reply
					.type(responseData.contentType)
					.code(responseData.statusCode)
					.send(responseData.body);
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

			return reply
				.type(responseData.contentType)
				.code(responseData.statusCode)
				.send(responseData.body);

		} catch (err) {
			const error = err as Error;
			req.log.error({ err: error.message, pagePath }, 'request failed');

			// The route's own error boundary: the analysed dive chain rides
			// the error object; unblind records it on the request span + the marker.
			unblind(error);

			// enrich the plain error with the chain instance context:
			// stores .args/.originalError/.instance in the error's props
			// (read via getProps(error)), the type stack goes to .stack.
			// Reflect.construct because utils.exception is typed as the
			// non-constructible CallableFunction — no cast needed this way.
			let displayError = error;
			if (chainInstance) {
				try {
					const enrichedError: Error = Reflect.construct(
						utils.exception, [ chainInstance, error ]
					);
					displayError = enrichedError;
				} catch {
					// fallback to plain error
				}
			}

			reply.code(500);
			return reply.type('text/html').send(
				`<h1>500 Internal Server Error</h1>` +
				`<pre>${displayError.message}</pre>`
			);
		}
	});
}
