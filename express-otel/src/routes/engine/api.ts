/**
 * Admin utility API — clear static cache, page CRUD.
 * Ported from _adm/api.php + page operations from tree_pages.php.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { Router, type Request, type Response } from 'express';
import '../../core/collections/engineTypes.js';
import { lookup } from 'mnemonica/module';
import { settings } from '../../core/settings.js';
import { wrap } from '@mnemonica/dive';
import { removeRecursive } from '../../lib/fileUtils.js';
import {
	handleContentGet,
	handleContentSet,
	handleSet,
	handleMkdir,
	handleDel
} from '../../lib/engineActions.js';

const ROOT = process.cwd();
const SETTINGS_PATH = path.join(ROOT, 'data', 'settings.json');

const EngineRequest = lookup('EngineRequest');

const router = Router();

router.post('/engine/api', async (req: Request, res: Response) => {
	const body = req.body as Record<string, unknown>;
	const action = String(body.action || '');
	const leaf = String(body.leaf || '');
	const pathName = String(body.path || '');
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

	if (action === 'clear_cache') {
		const staticPath = path.join(ROOT, settings.static);
		const ok = await wrap(function clearCache () {
			return removeRecursive(staticPath);
		}, engineRequest)();
		const cacheResult = new engineRequest.CacheResult(ok);
		res.type('application/json').send({ cleared : cacheResult.cleared });
		return;
	}

	if (action === 'content_get') {
		try {
			const result = await wrap(function contentGet () {
				return handleContentGet(leaf);
			}, engineRequest)();
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
		const result = await wrap(function contentSet () {
				return handleContentSet(leaf, data);
			}, engineRequest)();
		res.type('application/json').send(result);
		return;
	}

	if (action === 'set') {
		try {
			const result = await wrap(function pageSet () {
				return handleSet(leaf, pathName, data);
			}, engineRequest)();
			res.type('application/json').send(result);
		} catch {
			res.status(409).type('application/json').send({ error: 'Page already exists' });
		}
		return;
	}

	if (action === 'settings_path') {
		res.type('text/plain').send(settings.pages);
		return;
	}

	if (action === 'settings') {
		const dataVal = String(body.data || '');
		if (dataVal) {
			let storeVal = dataVal;
			try {
				const parsed = JSON.parse(dataVal) as Record<string, unknown>;
				if (parsed.val !== undefined) {
					storeVal = String(parsed.val);
				}
			} catch { /* not wrapped, store as-is */ }
			if (storeVal !== '') {
				await fs.writeFile(SETTINGS_PATH, storeVal, 'utf-8');
			}
		}
		const current = await fs.readFile(SETTINGS_PATH, 'utf-8');
		res.type('text/plain').send(current);
		return;
	}

	if (action === 'mkdir') {
		const result = await wrap(function pageMkdir () {
				return handleMkdir(leaf, pathName);
			}, engineRequest)();
		res.type('application/json').send(result);
		return;
	}

	if (action === 'del') {
		const result = await wrap(function pageDel () {
				return handleDel(leaf, pathName);
			}, engineRequest)();
		res.type('application/json').send(result);
		return;
	}

	res.status(400).type('application/json').send({ error: 'Unknown action' });
});

export default router;
