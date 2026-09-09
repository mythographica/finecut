/**
 * FrontendController — Catch-all route with full mnemonica chain.
 *
 * Mirrors finecutnode/src/routes/frontend.ts
 * Chain: RequestData → RouteData → PageData → RenderData → ResponseData
 */
import { Controller, Get, Req, Res } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { lookup, utils } from 'mnemonica/module';
import { errorContext } from '@mnemonica/nestjs';
import '../core/request-types.js';
import '../lib/registerHelpers.js';
import { FrontendService } from './frontend.service.js';
import { checkStaticCache } from '../plugins/static-cache.js';
import { fileExists, loadPageFiles } from '../lib/fileUtils.js';
import { render } from '../lib/templateEngine.js';
import {
	jsonInfo, headAdditional, contentParser, menuMain, menuLeft
} from '../lib/components.js';
import { settings } from '../core/settings.js';
import type { TemplateContext } from '../types/index.js';

const RequestData = lookup('RequestData');

@Controller()
export class FrontendController {
	constructor (private readonly frontendService: FrontendService) {}

	@Get('*')
	async handlePage (@Req() req: FastifyRequest, @Res() res: FastifyReply): Promise<void> {
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

			pagePath = this.frontendService.parseUrl(req.url);
			let isMain = false;

			if (pagePath === '/' || pagePath === '') {
				pagePath = '/_index';
				isMain = true;
			}

			const fullPagePath = this.frontendService.resolvePagePath(pagePath);

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
				res.status(responseData.statusCode)
					.type(responseData.contentType)
					.send(responseData.body);
				return;
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
			const templatePath = this.frontendService.resolveTemplatePath(
				renderData.template || 'default'
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

			res.status(responseData.statusCode)
				.type(responseData.contentType)
				.send(responseData.body);

		} catch (err) {
			const error = err as Error;

			// Errors thrown through a dive wrap() boundary self-pin the executing
			// instance; fall back to the newest active context for unpinned errors.
			const diveContext = errorContext(error);

			req.log.error({
				err      : error.message,
				pagePath,
				diveType : diveContext
					? ((diveContext as unknown as Record<symbol, unknown>)[Symbol.for('mnemonica.type')] as { TypeName?: string } | undefined)?.TypeName
					: undefined
			}, 'request failed');

			// mnemonica no longer binds .exception onto instances. utils.exception
			// is typed as a plain function but MUST be called with `new` — it stores
			// .args/.originalError/.instance in the error's props (read via
			// getProps(error)), the type stack goes to .stack.
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

			res.status(500).type('text/html').send(
				'<h1>500 Internal Server Error</h1>' +
				`<pre>${displayError.message}</pre>`
			);
		}
	}
}
