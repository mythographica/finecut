import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { startTestApp, type TestApp } from './httpHelper.js';

describe('frontend route', () => {
	let app: TestApp;

	beforeAll(async () => {
		const server = express();
		// Ensure mnemonica types are registered before lookup is called
		await import('../../src/core/collections/requestTypes.js');
		const { default: frontendRouter } = await import('../../src/routes/frontend.js');
		server.use(frontendRouter);
		app = await startTestApp(server);
	});

	afterAll(async () => {
		await app.close();
	});

	it('returns 200 for home page', async () => {
		const res = await app.inject({ method: 'GET', url: '/' });
		expect(res.statusCode).toBe(200);
		expect(res.headers['content-type']).toContain('text/html');
		expect(res.payload).toContain('<title>FineCut Home</title>');
	});

	it('returns 200 for documentation page', async () => {
		const res = await app.inject({ method: 'GET', url: '/documentation' });
		expect(res.statusCode).toBe(200);
		expect(res.payload).toContain('<title>Documentation</title>');
	});

	it('returns 404 for nonexistent page', async () => {
		const res = await app.inject({ method: 'GET', url: '/nonexistent' });
		expect(res.statusCode).toBe(404);
		expect(res.payload).toContain('404 Not Found');
	});
});
