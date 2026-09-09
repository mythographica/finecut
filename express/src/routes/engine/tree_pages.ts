/**
 * Page tree API — list, create, delete, get, set page content.
 * Ported from _adm/tree_pages.php.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { Router, type Request, type Response } from 'express';
import '../../core/collections/engineTypes.js';
import { lookup } from 'mnemonica/module';
import { paths as resolvePaths } from '../../lib/fileUtils.js';
import {
	handleContentGet,
	handleContentSet,
	handleSet,
	handleMkdir,
	handleDel
} from '../../lib/engineActions.js';

export { getPage, setPage } from '../../lib/pageStore.js';

const EngineRequest = lookup('EngineRequest');

const router = Router();

router.get('/engine/tree', async (req: Request, res: Response) => {
	const leaf = String(req.query.leaf || '');
	const pagesPath = resolvePaths(leaf);

	const entries = await fs.readdir(pagesPath, { withFileTypes: true });
	const tree = await Promise.all(
		entries
			.filter(e => e.isDirectory())
			.map(async e => {
				const subEntries = await fs.readdir(
					path.join(pagesPath, e.name),
					{ withFileTypes: true }
				).catch(() => [] as Awaited<ReturnType<typeof fs.readdir>>);
				const hasSubdirs = subEntries.some(se => se.isDirectory());
				return { name: e.name, folder: hasSubdirs };
			})
	);

	const engineRequest = new EngineRequest({
		body: { action: 'get', leaf } as Record<string, unknown>
	});
	const treeResult = new engineRequest.TreeResult({ tree });

	res.type('application/json').send(treeResult.tree);
});

router.get('/engine/page', async (req: Request, res: Response) => {
	const leaf = String(req.query.leaf || '');
	try {
		const result = await handleContentGet(leaf);
		res.type('application/json').send(result);
	} catch {
		res.status(404).type('application/json').send({ error: 'Page not found' });
	}
});

router.post('/engine/tree', async (req: Request, res: Response) => {
	const body = req.body as Record<string, unknown>;
	const action = String(body.action || '');
	const leaf = String(body.leaf || '');
	const pageName = String(body.path || '');
	let rawData = body.data;
	if (typeof rawData === 'string') {
		try { rawData = JSON.parse(rawData) as Record<string, unknown>; }
		catch { /* leave as-is */ }
	}
	const data = (typeof rawData === 'object' && rawData !== null)
		? rawData as Record<string, unknown>
		: undefined;

	const engineRequest = new EngineRequest({
		body: req.body as Record<string, unknown>
	});

	if (action === 'get') {
		const pagesPath = resolvePaths(leaf);
		const entries = await fs.readdir(pagesPath, { withFileTypes: true });
		const tree = await Promise.all(
			entries
				.filter(e => e.isDirectory())
				.map(async e => {
					const subEntries = await fs.readdir(
						path.join(pagesPath, e.name),
						{ withFileTypes: true }
					).catch(() => [] as Awaited<ReturnType<typeof fs.readdir>>);
					const hasSubdirs = subEntries.some(se => se.isDirectory());
					return { name: e.name, folder: hasSubdirs };
				})
		);
		const treeResult = new engineRequest.TreeResult({ tree });
		res.type('application/json').send(treeResult.tree);
		return;
	}

	if (action === 'set') {
		try {
			const result = await handleSet(leaf, pageName, data);
			res.type('application/json').send(result);
		} catch {
			res.status(409).type('application/json').send({ error: 'Page already exists' });
		}
		return;
	}

	if (action === 'mkdir') {
		const result = await handleMkdir(leaf, pageName);
		res.type('application/json').send(result);
		return;
	}

	if (action === 'del') {
		const result = await handleDel(leaf, pageName);
		res.type('application/json').send(result);
		return;
	}

	if (action === 'content_get') {
		try {
			const result = await handleContentGet(leaf);
			res.type('application/json').send(result);
		} catch {
			res.status(404).type('application/json').send({ error: 'Page not found' });
		}
		return;
	}

	if (action === 'content_set') {
		if (!data) {
			res.status(400).type('application/json').send({ error: 'Missing data' });
			return;
		}
		const result = await handleContentSet(leaf, data);
		res.type('application/json').send(result);
		return;
	}

	res.status(400).type('application/json').send({ error: 'Unknown action' });
});

export default router;
