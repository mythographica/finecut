/**
 * Template CRUD API — get, add, save, delete templates.
 * Ported from _adm/template_action.php.
 */
import path from 'path';
import type { FastifyRequest, FastifyReply } from 'fastify';
import '../../core/collections/engineTypes.js';
import { lookup } from 'mnemonica';
import { getfiles, setfiles, removeRecursive, fileExists, mkdirp } from '../../lib/fileUtils.js';

const ROOT = process.cwd();

const EngineRequest = lookup('EngineRequest');

type App = {
	get: (p: string, h: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>) => void;
	post: (p: string, h: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>) => void;
};

async function readTemplate (templatePath: string): Promise<{ source: string; snippet: string; header: string }> {
	const indexPath = path.join(templatePath, 'index.html');
	const snippetPath = path.join(templatePath, 'snippet.txt');
	const headerPath = path.join(templatePath, 'header.txt');

	return {
		source  : await fileExists(indexPath) ? await getfiles('index.html', templatePath) : '',
		snippet : await fileExists(snippetPath) ? await getfiles('snippet.txt', templatePath) : '',
		header  : await fileExists(headerPath) ? await getfiles('header.txt', templatePath) : ''
	};
}

async function writeTemplate (templatePath: string, source: string, snippet: string, header: string): Promise<void> {
	await Promise.all([
		setfiles('index.html', templatePath, source),
		setfiles('snippet.txt', templatePath, snippet),
		setfiles('header.txt', templatePath, header)
	]);
}

export default async function (app: App): Promise<void> {

	app.get('/engine/template-action', async (req: FastifyRequest, reply: FastifyReply) => {
		const query = req.query as Record<string, unknown>;
		const action = String(query.action || '');
		const template = String(query.template || '');

		if (!template) {
			reply.code(400);
			return reply.type('application/json').send({ error: 'Missing template name' });
		}

		const templatePath = path.join(ROOT, 'views', 'templates', template);
		const engineRequest = new EngineRequest({
			body: { action, template } as Record<string, unknown>
		});

		if (action === 'get') {
			if (!await fileExists(templatePath)) {
				reply.code(404);
				return reply.type('application/json').send({ error: 'Template not found' });
			}
			const data = await readTemplate(templatePath);
			const templateResult = new engineRequest.TemplateResult(data);
			return reply.type('application/json').send(templateResult.template);
		}

		if (action === 'getInfo') {
			if (!await fileExists(templatePath)) {
				reply.code(404);
				return reply.type('application/json').send({ error: 'Template not found' });
			}
			const { snippet, header } = await readTemplate(templatePath);
			const templateResult = new engineRequest.TemplateResult({ snippet, header });
			return reply.type('application/json').send(templateResult.template);
		}

		reply.code(400);
		return reply.type('application/json').send({ error: 'Unknown action' });
	});

	app.post('/engine/template-action', async (req: FastifyRequest, reply: FastifyReply) => {
		const body = req.body as Record<string, unknown>;
		const action = String(body.action || '');
		const template = String(body.template || '');
		const source = String(body.source || '');
		const snippet = String(body.snippet || '');
		const header = String(body.header || '');

		if (!template) {
			reply.code(400);
			return reply.type('application/json').send({ error: 'Missing template name' });
		}
		const templatePath = path.join(ROOT, 'views', 'templates', template);

		if (action === 'get') {
			if (!await fileExists(templatePath)) {
				return reply.type('application/json').send({ source: '', snippet: '', header: '' });
			}
			const data = await readTemplate(templatePath);
			const engineRequest = new EngineRequest({
				body: { action, template } as Record<string, unknown>
			});
			const templateResult = new engineRequest.TemplateResult(data);
			return reply.type('application/json').send(templateResult.template);
		}

		if (action === 'getInfo') {
			if (!await fileExists(templatePath)) {
				return reply.type('application/json').send({ snippet: '', header: '' });
			}
			const { snippet: s, header: h } = await readTemplate(templatePath);
			const engineRequest = new EngineRequest({
				body: { action, template } as Record<string, unknown>
			});
			const templateResult = new engineRequest.TemplateResult({ snippet: s, header: h });
			return reply.type('application/json').send(templateResult.template);
		}

		if (action === 'add') {
			if (await fileExists(templatePath)) {
				reply.code(409);
				return reply.type('application/json').send({ error: 'Template already exists' });
			}
			await mkdirp(templatePath);
			await writeTemplate(templatePath, source, snippet, header);
			return reply.type('application/json').send({ success : true });
		}

		if (action === 'save') {
			if (!await fileExists(templatePath)) {
				reply.code(404);
				return reply.type('application/json').send({ error: 'Template not found' });
			}
			await writeTemplate(templatePath, source, snippet, header);
			return reply.type('application/json').send({ success : true });
		}

		if (action === 'del') {
			const ok = await removeRecursive(templatePath);
			return reply.type('application/json').send({ success : ok });
		}

		reply.code(400);
		return reply.type('application/json').send({ error: 'Unknown action' });
	});
}
