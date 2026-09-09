/**
 * Frontend catch-all route.
 * Mnemonica chain: RequestData → RouteData → PageData → RenderData → ResponseData
 */
import path from 'path';
import type { FastifyRequest, FastifyReply } from 'fastify';
import '../core/collections/requestTypes.js';
import { lookup, utils } from 'mnemonica';
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

			const pageFiles = await loadPageFiles(fullPagePath);
			const pageData = new routeData.PageData(pageFiles);
			chainInstance = pageData;

			// Check static cache before rendering
			const cached = await checkStaticCache(pagePath, pageFiles.header);
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

			// Resolve components
			const components = {
				jsonInfo       : jsonInfo(pageData),
				headAdditional : headAdditional(),
				contentParser  : await contentParser(pageData),
				menuMain       : await menuMain(pageData),
				menuLeft       : await menuLeft(pageData)
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

			const html = await render(templatePath, context);

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

			// enrich the plain error with the chain instance context:
			// stores .args/.originalError/.instance in the error's props
			// (read via getProps(error)), the type stack goes to .stack
			let displayError = error;
			if (chainInstance) {
				try {
					const ExceptionCtor = utils.exception as unknown as
						new (instance: object, e: Error) => Error;
					const enrichedError = new ExceptionCtor(chainInstance, error);
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
