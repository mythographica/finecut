/**
 * Admin utility API — clear static cache, page CRUD.
 * Ported from _adm/api.php + page operations from tree_pages.php.
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { FastifyRequest, FastifyReply } from 'fastify';
import '../../core/collections/engineTypes.js';
import { lookup } from 'mnemonica';
import { settings } from '../../core/settings.js';
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

type App = {
	get: (p: string, h: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>) => void;
	post: (p: string, h: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>) => void;
};

export default async function (app: App): Promise<void> {

	app.post('/engine/api', async (req: FastifyRequest, reply: FastifyReply) => {
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
			const ok = await removeRecursive(staticPath);
			const cacheResult = new engineRequest.CacheResult(ok);
			return reply.type('application/json').send({ cleared : cacheResult.cleared });
		}

		if (action === 'content_get') {
			try {
				const result = await handleContentGet(leaf);
				return reply.type('application/json').send(result);
			} catch {
				reply.code(404);
				return reply.type('application/json').send({ error: 'Page not found' });
			}
		}

		if (action === 'content_set') {
			if (!data) {
				reply.code(400);
				return reply.type('application/json').send({ error: 'Missing data' });
			}
			const result = await handleContentSet(leaf, data);
			return reply.type('application/json').send(result);
		}

		if (action === 'set') {
			try {
				const result = await handleSet(leaf, pathName, data);
				return reply.type('application/json').send(result);
			} catch {
				reply.code(409);
				return reply.type('application/json').send({ error: 'Page already exists' });
			}
		}

		if (action === 'settings_path') {
			return reply.type('text/plain').send(settings.pages);
		}

		if (action === 'settings') {
			const dataVal = String(body.data || '');
			if (dataVal) {
				// Frontend wraps settings in {val: ...} — unwrap before storing
				let storeVal = dataVal;
				try {
					const parsed = JSON.parse(dataVal) as Record<string, unknown>;
					if (parsed.val !== undefined) {
						storeVal = String(parsed.val);
					}
				} catch { /* not wrapped, store as-is */ }
				// Only write when value is non-empty (matches PHP behavior)
				if (storeVal !== '') {
					await fs.writeFile(SETTINGS_PATH, storeVal, 'utf-8');
				}
			}
			const current = await fs.readFile(SETTINGS_PATH, 'utf-8');
			return reply.type('text/plain').send(current);
		}

		if (action === 'mkdir') {
			const result = await handleMkdir(leaf, pathName);
			return reply.type('application/json').send(result);
		}

		if (action === 'del') {
			const result = await handleDel(leaf, pathName);
			return reply.type('application/json').send(result);
		}

		reply.code(400);
		return reply.type('application/json').send({ error: 'Unknown action' });
	});
}
