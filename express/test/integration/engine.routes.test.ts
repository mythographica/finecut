import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { startTestApp, type TestApp } from './httpHelper.js';
import { promises as fs } from 'fs';
import path from 'path';

describe('engine routes', () => {
	let app: TestApp;
	const ROOT = process.cwd();
	const testPagePath = path.join(ROOT, 'data', 'pages', '_test_integration');
	const testStaticPath = path.join(ROOT, 'data', 'static');
	const testTemplatePath = path.join(ROOT, 'views', 'templates', '_test_template');

	beforeAll(async () => {
		const server = express();
		server.use(express.json());
		server.use(express.urlencoded({ extended: true }));

		// Ensure mnemonica types are registered before lookup is called
		await import('../../src/core/collections/engineTypes.js');

		// Register engine routes directly
		const { default: settingsRouter } = await import('../../src/routes/engine/settings.js');
		server.use(settingsRouter);

		const { default: treePagesRouter } = await import('../../src/routes/engine/tree_pages.js');
		server.use(treePagesRouter);

		const { default: templateRouter } = await import('../../src/routes/engine/template.js');
		server.use(templateRouter);

		const { default: templateActionRouter } = await import('../../src/routes/engine/template_action.js');
		server.use(templateActionRouter);

		const { default: apiRouter } = await import('../../src/routes/engine/api.js');
		server.use(apiRouter);

		app = await startTestApp(server);

		// Ensure clean state
		await fs.rm(testPagePath, { recursive: true, force: true });
		await fs.rm(testTemplatePath, { recursive: true, force: true });
	});

	afterAll(async () => {
		await fs.rm(testPagePath, { recursive: true, force: true });
		await fs.rm(testTemplatePath, { recursive: true, force: true });
		await app.close();
	});

	describe('/engine/settings', () => {
		it('GET returns settings object', async () => {
			const res = await app.inject({ method: 'GET', url: '/engine/settings' });
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload) as Record<string, unknown>;
			expect(body.pages).toBe('data/pages');
			expect(body.use_static).toBe(true);
		});

		it('POST updates settings', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/engine/settings',
				payload: { data: { microtimeEcho: false } }
			});
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload) as Record<string, unknown>;
			expect(body.microtimeEcho).toBe(false);

			// Restore
			await app.inject({
				method: 'POST',
				url: '/engine/settings',
				payload: { data: { microtimeEcho: true } }
			});
		});
	});

	describe('/engine/tree', () => {
		it('GET lists pages at root', async () => {
			const res = await app.inject({ method: 'GET', url: '/engine/tree?leaf=' });
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload) as Array<{ name: string }>;
			expect(Array.isArray(body)).toBe(true);
			expect(body.length).toBeGreaterThan(0);
		});

		it('POST action=set creates a page', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/engine/tree',
				payload: { action: 'set', leaf: '', path: '_test_integration', data: { header: { title: 'Test' }, content: 'Hello' } }
			});
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload) as Record<string, unknown>;
			expect(body.status).toBe(true);
		});

		it('POST action=content_get returns page content', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/engine/tree',
				payload: { action: 'content_get', leaf: '_index' }
			});
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload) as Record<string, unknown>;
			expect(body.status).toBe(true);
			expect((body.page as Record<string, unknown>).header).toBeDefined();
		});

		it('POST action=content_get returns 404 for missing page', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/engine/tree',
				payload: { action: 'content_get', leaf: 'nonexistent' }
			});
			expect(res.statusCode).toBe(404);
		});

		it('POST action=set returns 409 for duplicate', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/engine/tree',
				payload: { action: 'set', leaf: '', path: '_test_integration' }
			});
			expect(res.statusCode).toBe(409);
		});

		it('POST action=content_set updates page', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/engine/tree',
				payload: { action: 'content_set', leaf: '_test_integration', data: { content: 'Updated', header: { title: 'Updated' } } }
			});
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload) as Record<string, unknown>;
			expect(body.status).toBe(true);
		});

		it('POST action=del deletes page', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/engine/tree',
				payload: { action: 'del', leaf: '_test_integration' }
			});
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload) as Record<string, unknown>;
			expect(body.success).toBe(true);
		});
	});

	describe('/engine/page', () => {
		it('GET returns page content', async () => {
			const res = await app.inject({ method: 'GET', url: '/engine/page?leaf=_index' });
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload) as Record<string, unknown>;
			expect(body.status).toBe(true);
			expect((body.page as Record<string, unknown>).header).toBeDefined();
		});

		it('GET returns 404 for missing page', async () => {
			const res = await app.inject({ method: 'GET', url: '/engine/page?leaf=nonexistent' });
			expect(res.statusCode).toBe(404);
		});
	});

	describe('/engine/template', () => {
		it('GET lists templates excluding default', async () => {
			const res = await app.inject({ method: 'GET', url: '/engine/template' });
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload) as Array<{ name: string }>;
			expect(Array.isArray(body)).toBe(true);
			expect(body.find(t => t.name === 'default')).toBeUndefined();
		});
	});

	describe('/engine/template-action', () => {
		it('GET action=get returns template files', async () => {
			const res = await app.inject({ method: 'GET', url: '/engine/template-action?action=get&template=default' });
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload) as Record<string, unknown>;
			expect(body.source).toBeDefined();
		});

		it('GET action=get returns 404 for missing template', async () => {
			const res = await app.inject({ method: 'GET', url: '/engine/template-action?action=get&template=nonexistent' });
			expect(res.statusCode).toBe(404);
		});

		it('POST action=add creates template', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/engine/template-action',
				payload: { action: 'add', template: '_test_template', source: '<html></html>', snippet: 'hi', header: '{}' }
			});
			expect(res.statusCode).toBe(200);
			expect(JSON.parse(res.payload).success).toBe(true);
		});

		it('POST action=add returns 409 for duplicate', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/engine/template-action',
				payload: { action: 'add', template: '_test_template', source: '' }
			});
			expect(res.statusCode).toBe(409);
		});

		it('POST action=save updates template', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/engine/template-action',
				payload: { action: 'save', template: '_test_template', source: '<html>updated</html>', snippet: 'updated', header: '{}' }
			});
			expect(res.statusCode).toBe(200);
		});

		it('POST action=del deletes template', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/engine/template-action',
				payload: { action: 'del', template: '_test_template' }
			});
			expect(res.statusCode).toBe(200);
			expect(JSON.parse(res.payload).success).toBe(true);
		});
	});

	describe('/engine/api', () => {
		it('POST clear_cache clears static files', async () => {
			// Create a dummy cache file first
			await fs.mkdir(testStaticPath, { recursive: true });
			await fs.writeFile(path.join(testStaticPath, 'test.html'), 'test', 'utf-8');

			const res = await app.inject({
				method: 'POST',
				url: '/engine/api',
				payload: { action: 'clear_cache' }
			});
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload) as Record<string, unknown>;
			expect(body.cleared).toBe(true);
		});

		it('POST content_get returns page', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/engine/api',
				payload: { action: 'content_get', leaf: '_index' }
			});
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload) as Record<string, unknown>;
			expect(body.status).toBe(true);
		});

		it('POST set creates page', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/engine/api',
				payload: { action: 'set', leaf: '', path: '_test_api', data: { header: { title: 'API Test' } } }
			});
			expect(res.statusCode).toBe(200);
			const body = JSON.parse(res.payload) as Record<string, unknown>;
			expect(body.status).toBe(true);

			// Clean up
			await fs.rm(path.join(ROOT, 'data', 'pages', '_test_api'), { recursive: true, force: true });
		});

		it('POST returns 400 for unknown action', async () => {
			const res = await app.inject({
				method: 'POST',
				url: '/engine/api',
				payload: { action: 'unknown' }
			});
			expect(res.statusCode).toBe(400);
		});
	});
});
