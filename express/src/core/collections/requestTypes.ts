/**
 * Frontend mnemonica type collection.
 * RequestData → RouteData → PageData → RenderData → ResponseData
 */
import { define } from 'mnemonica';
import type { PageFiles, RouteInfo, ResponseOutput } from '../../types/index.js';

export const RequestData = define('RequestData', function (
	this: {
		method: string;
		url: string;
		query: Record<string, unknown>;
		params: Record<string, unknown>;
		body: Record<string, unknown>;
		headers: Record<string, unknown>;
		requestId: string;
	},
	req: {
		method: string;
		url: string;
		query: Record<string, unknown>;
		params: Record<string, unknown>;
		body: Record<string, unknown>;
		headers: Record<string, unknown>;
		id: string;
	}
) {
	this.method = req.method;
	this.url = req.url;
	this.query = req.query;
	this.params = req.params;
	this.body = req.body;
	this.headers = req.headers;
	this.requestId = req.id;
});

export const RouteData = RequestData.define('RouteData', function (
	this: {
		pagePath: string;
		isMain: boolean;
		deep: string;
	},
	routeInfo: RouteInfo
) {
	this.pagePath = routeInfo.pagePath;
	this.isMain = routeInfo.isMain;
	this.deep = routeInfo.deep;
});

export const PageData = RouteData.define('PageData', function (
	this: {
		header: PageFiles['header'];
		content: string;
		info: Record<string, unknown>;
		blocks: Array<{ name: string; value: string }>;
		path: string;
	},
	pageFiles: PageFiles
) {
	this.header = pageFiles.header;
	this.content = pageFiles.content;
	this.info = pageFiles.info;
	this.blocks = pageFiles.blocks;
	this.path = pageFiles.path;
});

export const RenderData = PageData.define('RenderData', function (
	this: {
		header: PageFiles['header'];
		content: string;
		info: Record<string, unknown>;
		blocks: Array<{ name: string; value: string }>;
		path: string;
		isMain: boolean;
		deep: string;
		pagePath: string;
		components: Record<string, string | Promise<string>>;
		template: string | undefined;
	},
	components: Record<string, string | Promise<string>>
) {
	this.components = components;
	this.template = this.header?.template;
});

export const ResponseData = RenderData.define('ResponseData', function (
	this: {
		body: string;
		contentType: string;
		statusCode: number;
		fromCache: boolean;
	},
	output: ResponseOutput
) {
	this.body = output.body;
	this.contentType = output.contentType;
	this.statusCode = output.statusCode;
	this.fromCache = output.fromCache;
});
