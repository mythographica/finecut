/**
 * Core type definitions for FineCut CMS.
 * All instance data uses `type`, never `interface`.
 */

import type { RequestData_RouteData_PageData } from '../../.tactica/types.js';

// Page metadata from header.txt
export type PageHeader = {
	title       : string;
	template    : string;
	pageIsCode  : boolean;
	keywords    : string;
	description : string;
	additional  : string;
};

// All files loaded for a single page
export type PageFiles = {
	header  : PageHeader | null;
	content : string;
	info    : Record<string, unknown>;
	blocks  : Array<{ name: string; value: string }>;
	path    : string;
};

// Route data after URL parsing
export type RouteInfo = {
	pagePath : string;
	isMain   : boolean;
	deep     : string;
};

// Final response output
export type ResponseOutput = {
	body        : string;
	contentType : string;
	statusCode  : number;
	fromCache   : boolean;
};

// Base page context — data properties from the mnemonica PageData instance
// Used for component functions before components are resolved.
export type PageContext = Pick<RequestData_RouteData_PageData,
	'header' | 'content' | 'info' | 'blocks' | 'path' | 'isMain' | 'deep' | 'pagePath'
>;

// Template render context — extends page data with resolved components
export type TemplateContext = PageContext & {
	components: Record<string, string>;
};

// Template helper function signature (sync or async)
export type HelperFn = (ctx: TemplateContext) => string | Promise<string>;

// Settings object
export type Settings = {
	pages           : string;
	use_static      : boolean;
	static          : string;
	perm_folder     : number;
	perm_file       : number;
	fileNameEncoding: string;
	microtimeEcho   : boolean;
};
