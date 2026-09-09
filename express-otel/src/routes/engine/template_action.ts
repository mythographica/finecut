/**
 * Template CRUD API — get, add, save, delete templates.
 * Ported from _adm/template_action.php.
 */
import path from 'path';
import { Router, type Request, type Response } from 'express';
import '../../core/collections/engineTypes.js';
import { lookup } from 'mnemonica/module';
import { getfiles, setfiles, removeRecursive, fileExists, mkdirp } from '../../lib/fileUtils.js';

const ROOT = process.cwd();

const EngineRequest = lookup('EngineRequest');

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

const router = Router();

router.get('/engine/template-action', async (req: Request, res: Response) => {
	const action = String(req.query.action || '');
	const template = String(req.query.template || '');

	if (!template) {
		res.status(400).type('application/json').send({ error: 'Missing template name' });
		return;
	}

	const templatePath = path.join(ROOT, 'views', 'templates', template);
	const engineRequest = new EngineRequest({
		body: { action, template } as Record<string, unknown>
	});

	if (action === 'get') {
		if (!await fileExists(templatePath)) {
			res.status(404).type('application/json').send({ error: 'Template not found' });
			return;
		}
		const data = await readTemplate(templatePath);
		const templateResult = new engineRequest.TemplateResult(data);
		res.type('application/json').send(templateResult.template);
		return;
	}

	if (action === 'getInfo') {
		if (!await fileExists(templatePath)) {
			res.status(404).type('application/json').send({ error: 'Template not found' });
			return;
		}
		const { snippet, header } = await readTemplate(templatePath);
		const templateResult = new engineRequest.TemplateResult({ snippet, header });
		res.type('application/json').send(templateResult.template);
		return;
	}

	res.status(400).type('application/json').send({ error: 'Unknown action' });
});

router.post('/engine/template-action', async (req: Request, res: Response) => {
	const body = req.body as Record<string, unknown>;
	const action = String(body.action || '');
	const template = String(body.template || '');
	const source = String(body.source || '');
	const snippet = String(body.snippet || '');
	const header = String(body.header || '');

	if (!template) {
		res.status(400).type('application/json').send({ error: 'Missing template name' });
		return;
	}
	const templatePath = path.join(ROOT, 'views', 'templates', template);

	if (action === 'get') {
		if (!await fileExists(templatePath)) {
			res.type('application/json').send({ source: '', snippet: '', header: '' });
			return;
		}
		const data = await readTemplate(templatePath);
		const engineRequest = new EngineRequest({
			body: { action, template } as Record<string, unknown>
		});
		const templateResult = new engineRequest.TemplateResult(data);
		res.type('application/json').send(templateResult.template);
		return;
	}

	if (action === 'getInfo') {
		if (!await fileExists(templatePath)) {
			res.type('application/json').send({ snippet: '', header: '' });
			return;
		}
		const { snippet: s, header: h } = await readTemplate(templatePath);
		const engineRequest = new EngineRequest({
			body: { action, template } as Record<string, unknown>
		});
		const templateResult = new engineRequest.TemplateResult({ snippet: s, header: h });
		res.type('application/json').send(templateResult.template);
		return;
	}

	if (action === 'add') {
		if (await fileExists(templatePath)) {
			res.status(409).type('application/json').send({ error: 'Template already exists' });
			return;
		}
		await mkdirp(templatePath);
		await writeTemplate(templatePath, source, snippet, header);
		res.type('application/json').send({ success : true });
		return;
	}

	if (action === 'save') {
		if (!await fileExists(templatePath)) {
			res.status(404).type('application/json').send({ error: 'Template not found' });
			return;
		}
		await writeTemplate(templatePath, source, snippet, header);
		res.type('application/json').send({ success : true });
		return;
	}

	if (action === 'del') {
		const ok = await removeRecursive(templatePath);
		res.type('application/json').send({ success : ok });
		return;
	}

	res.status(400).type('application/json').send({ error: 'Unknown action' });
});

export default router;
