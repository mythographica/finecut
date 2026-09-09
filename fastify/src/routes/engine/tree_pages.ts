/**
 * Page tree API — list, create, delete, get, set page content.
 * Ported from _adm/tree_pages.php.
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { FastifyRequest, FastifyReply } from 'fastify';
import '../../core/collections/engineTypes.js';
import { lookup } from 'mnemonica';
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

type App = {
	get: (p: string, h: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>) => void;
	post: (p: string, h: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>) => void;
};

export default async function (app: App): Promise<void> {

	app.get('/engine/tree', async (req: FastifyRequest, reply: FastifyReply) => {
		const query = req.query as Record<string, unknown>;
		const leaf = String(query.leaf || '');
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

		return reply.type('application/json').send(treeResult.tree);
	});

	app.get('/engine/page', async (req: FastifyRequest, reply: FastifyReply) => {
		const query = req.query as Record<string, unknown>;
		const leaf = String(query.leaf || '');
		try {
			const result = await handleContentGet(leaf);
			return reply.type('application/json').send(result);
		} catch {
			reply.code(404);
			return reply.type('application/json').send({ error: 'Page not found' });
		}
	});

	app.post('/engine/tree', async (req: FastifyRequest, reply: FastifyReply) => {
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

		req.log.debug({ action, leaf, pageName }, 'tree POST request');

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
			return reply.type('application/json').send(treeResult.tree);
		}

		if (action === 'set') {
			try {
				const result = await handleSet(leaf, pageName, data);
				return reply.type('application/json').send(result);
			} catch {
				reply.code(409);
				return reply.type('application/json').send({ error: 'Page already exists' });
			}
		}

		if (action === 'mkdir') {
			const result = await handleMkdir(leaf, pageName);
			return reply.type('application/json').send(result);
		}

		if (action === 'del') {
			const result = await handleDel(leaf, pageName);
			return reply.type('application/json').send(result);
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

		reply.code(400);
		return reply.type('application/json').send({ error: 'Unknown action' });
	});
}
