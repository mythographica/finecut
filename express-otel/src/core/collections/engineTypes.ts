/**
 * Engine (admin API) mnemonica type collection.
 */
import { define } from 'mnemonica';
import type { rawPageFiles } from '../../lib/pageStore.js';

// Tree item with folder flag (ported from PHP tree_pages.php)
export type TreeItem = {
	name   : string;
	folder?: boolean;
};

// Engine request payload — typed admin action parameters
export type EngineRequestData = {
	action   : string;
	data    ?: Record<string, unknown>;
	leaf    ?: string;
	path    ?: string;
	template?: string;
};

export const EngineRequest = define('EngineRequest', function (
	this: EngineRequestData,
	req: { body: Record<string, unknown> }
) {
	this.action   = String(req.body.action || '');
	this.data     = req.body.data as Record<string, unknown> | undefined;
	this.leaf     = String(req.body.leaf || '');
	this.path     = String(req.body.path || '');
	this.template = String(req.body.template || '');
});

export const TreeResult = EngineRequest.define('TreeResult', function (
	this: { tree: TreeItem[] },
	result: { tree: TreeItem[] }
) {
	this.tree = result.tree;
});

export const PageResult = EngineRequest.define('PageResult', function (
	this: { page: rawPageFiles },
	pageData: rawPageFiles
) {
	this.page = pageData;
});

export const CacheResult = EngineRequest.define('CacheResult', function (
	this: { cleared: boolean },
	cleared: boolean
) {
	this.cleared = cleared;
});

export const TemplateResult = EngineRequest.define('TemplateResult', function (
	this: { template: { source?: string; snippet?: string; header?: string } },
	templateData: { source?: string; snippet?: string; header?: string }
) {
	this.template = templateData;
});
