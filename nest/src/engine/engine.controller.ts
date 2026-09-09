/**
 * EngineController — Admin API routes.
 *
 * Mirrors finecutnode/src/routes/engine/*.ts
 * Uses mnemonica chains for admin operations.
 */
import {
	Controller, Get, Post, Query, Body, Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { lookup } from 'mnemonica/module';
import '../core/engine-types.js';
import { EngineService } from './engine.service.js';

const EngineRequest = lookup('EngineRequest');

@Controller('engine')
export class EngineController {
	constructor (private readonly engineService: EngineService) {}

	// Settings
	@Get('settings')
	async getSettings () {
		return this.engineService.loadSettings();
	}

	@Post('settings')
	async postSettings (@Body() body: Record<string, unknown>) {
		const engineRequest = new EngineRequest({ body });
		const data = engineRequest.data as Record<string, unknown> | undefined;
		if (!data) {
			return { error: 'Missing data field' };
		}
		return this.engineService.saveSettings(data);
	}

	// Tree
	@Get('tree')
	async getTree (@Query('leaf') leaf = '') {
		const tree = await this.engineService.getPageTree(leaf);
		const engineRequest = new EngineRequest({
			body: { action: 'get', leaf },
		});
		const treeResult = new engineRequest.TreeResult({ tree });
		return treeResult.tree;
	}

	@Post('tree')
	async postTree (@Body() body: Record<string, unknown>, @Res() res: FastifyReply) {
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

		const engineRequest = new EngineRequest({ body });

		if (action === 'get') {
			const tree = await this.engineService.getPageTree(leaf);
			const treeResult = new engineRequest.TreeResult({ tree });
			return res.type('application/json').send(treeResult.tree);
		}

		if (action === 'set') {
			try {
				const result = await this.engineService.handleSet(leaf, pageName, data);
				return res.type('application/json').send(result);
			} catch {
				return res.status(409).type('application/json').send({ error: 'Page already exists' });
			}
		}

		if (action === 'mkdir') {
			const result = await this.engineService.handleMkdir(leaf, pageName);
			return res.type('application/json').send(result);
		}

		if (action === 'del') {
			const result = await this.engineService.handleDel(leaf, pageName);
			return res.type('application/json').send(result);
		}

		if (action === 'content_get') {
			try {
				const result = await this.engineService.handleContentGet(leaf);
				return res.type('application/json').send(result);
			} catch {
				return res.status(404).type('application/json').send({ error: 'Page not found' });
			}
		}

		if (action === 'content_set') {
			if (!data) {
				return res.status(400).type('application/json').send({ error: 'Missing data' });
			}
			const result = await this.engineService.handleContentSet(leaf, data);
			return res.type('application/json').send(result);
		}

		return res.status(400).type('application/json').send({ error: 'Unknown action' });
	}

	// Page (GET shortcut)
	@Get('page')
	async getPage (@Query('leaf') leaf = '', @Res() res: FastifyReply) {
		try {
			const result = await this.engineService.handleContentGet(leaf);
			return res.type('application/json').send(result);
		} catch {
			return res.status(404).type('application/json').send({ error: 'Page not found' });
		}
	}

	// Template list
	@Get('template')
	async getTemplates () {
		return this.engineService.getTemplates();
	}

	// Template actions
	@Get('template-action')
	async getTemplateAction (
		@Query('action') action: string,
		@Query('template') template: string,
		@Res() res: FastifyReply,
	) {
		if (!template) {
			return res.status(400).type('application/json').send({ error: 'Missing template name' });
		}

		if (action === 'get') {
			const data = await this.engineService.readTemplate(template);
			if (!data) {
				return res.status(404).type('application/json').send({ error: 'Template not found' });
			}
			const engineRequest = new EngineRequest({
				body: { action, template },
			});
			const templateResult = new engineRequest.TemplateResult(data);
			return res.type('application/json').send(templateResult.template);
		}

		if (action === 'getInfo') {
			const data = await this.engineService.readTemplate(template);
			if (!data) {
				return res.status(404).type('application/json').send({ error: 'Template not found' });
			}
			const engineRequest = new EngineRequest({
				body: { action, template },
			});
			const templateResult = new engineRequest.TemplateResult({
				snippet: data.snippet,
				header: data.header,
			});
			return res.type('application/json').send(templateResult.template);
		}

		return res.status(400).type('application/json').send({ error: 'Unknown action' });
	}

	@Post('template-action')
	async postTemplateAction (
		@Body() body: Record<string, unknown>,
		@Res() res: FastifyReply,
	) {
		const action = String(body.action || '');
		const template = String(body.template || '');
		const source = String(body.source || '');
		const snippet = String(body.snippet || '');
		const header = String(body.header || '');

		if (!template) {
			return res.status(400).type('application/json').send({ error: 'Missing template name' });
		}

		if (action === 'get') {
			const data = await this.engineService.readTemplate(template);
			if (!data) {
				return res.type('application/json').send({ source: '', snippet: '', header: '' });
			}
			const engineRequest = new EngineRequest({
				body: { action, template },
			});
			const templateResult = new engineRequest.TemplateResult(data);
			return res.type('application/json').send(templateResult.template);
		}

		if (action === 'getInfo') {
			const data = await this.engineService.readTemplate(template);
			if (!data) {
				return res.type('application/json').send({ snippet: '', header: '' });
			}
			const engineRequest = new EngineRequest({
				body: { action, template },
			});
			const templateResult = new engineRequest.TemplateResult({
				snippet: data.snippet,
				header: data.header,
			});
			return res.type('application/json').send(templateResult.template);
		}

		if (action === 'add') {
			const ok = await this.engineService.addTemplate(template, source, snippet, header);
			if (!ok) {
				return res.status(409).type('application/json').send({ error: 'Template already exists' });
			}
			return res.type('application/json').send({ success: true });
		}

		if (action === 'save') {
			const ok = await this.engineService.saveTemplate(template, source, snippet, header);
			if (!ok) {
				return res.status(404).type('application/json').send({ error: 'Template not found' });
			}
			return res.type('application/json').send({ success: true });
		}

		if (action === 'del') {
			const ok = await this.engineService.deleteTemplate(template);
			return res.type('application/json').send({ success: ok });
		}

		return res.status(400).type('application/json').send({ error: 'Unknown action' });
	}

	// API
	@Post('api')
	async postApi (@Body() body: Record<string, unknown>, @Res() res: FastifyReply) {
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

		const engineRequest = new EngineRequest({ body });

		if (action === 'clear_cache') {
			const ok = await this.engineService.clearCache();
			const cacheResult = new engineRequest.CacheResult(ok);
			return res.type('application/json').send({ cleared: cacheResult.cleared });
		}

		if (action === 'content_get') {
			try {
				const result = await this.engineService.handleContentGet(leaf);
				return res.type('application/json').send(result);
			} catch {
				return res.status(404).type('application/json').send({ error: 'Page not found' });
			}
		}

		if (action === 'content_set') {
			if (!data) {
				return res.status(400).type('application/json').send({ error: 'Missing data' });
			}
			const result = await this.engineService.handleContentSet(leaf, data);
			return res.type('application/json').send(result);
		}

		if (action === 'set') {
			try {
				const result = await this.engineService.handleSet(leaf, pathName, data);
				return res.type('application/json').send(result);
			} catch {
				return res.status(409).type('application/json').send({ error: 'Page already exists' });
			}
		}

		if (action === 'settings_path') {
			return res.type('text/plain').send(this.engineService.getPagesPath());
		}

		if (action === 'settings') {
			const dataVal = String(body.data || '');
			return res.type('text/plain').send(await this.engineService.handleSettings(dataVal));
		}

		if (action === 'mkdir') {
			const result = await this.engineService.handleMkdir(leaf, pathName);
			return res.type('application/json').send(result);
		}

		if (action === 'del') {
			const result = await this.engineService.handleDel(leaf, pathName);
			return res.type('application/json').send(result);
		}

		return res.status(400).type('application/json').send({ error: 'Unknown action' });
	}

	// Health
	@Get('health')
	health () {
		return { status: 'ok', mnemonica: true };
	}
}
