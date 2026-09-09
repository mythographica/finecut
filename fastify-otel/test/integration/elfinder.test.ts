/**
 * elFinder backend integration tests — using elfinder-node.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import path from 'path';
import { promises as fs } from 'fs';

const ROOT = process.cwd();
const TEST_FILES = path.join(ROOT, 'data', 'files', '_test_elfinder');

describe('/engine/elfinder', () => {
	let app: FastifyInstance;

	beforeAll(async () => {
		app = Fastify({ logger: false });
		const { default: registerAdmin } = await import('../../src/routes/engine/admin.js');
		await registerAdmin(app);
		await app.ready();

		// Create test directory
		await fs.mkdir(TEST_FILES, { recursive: true });
		await fs.writeFile(path.join(TEST_FILES, 'test.txt'), 'hello', 'utf-8');
	});

	afterAll(async () => {
		// Clean up test directory
		await fs.rm(TEST_FILES, { recursive: true, force: true });
		await app.close();
	});

	it('GET open init returns api, cwd, files, options', async () => {
		const res = await app.inject({ method: 'GET', url: '/engine/elfinder?cmd=open&init=1' });
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload) as Record<string, unknown>;
		expect(body.api).toBe('2.1');
		expect(body.cwd).toBeDefined();
		expect(body.files).toBeDefined();
		expect(Array.isArray(body.files)).toBe(true);
		expect(body.options).toBeDefined();
	});

	it('GET mkdir creates directory', async () => {
		const res = await app.inject({
			method: 'GET',
			url: '/engine/elfinder?cmd=mkdir&name=_test_dir&target=v0_Lw'
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload) as Record<string, unknown>;
		expect(body.added).toBeDefined();
		expect(Array.isArray(body.added)).toBe(true);

		// Clean up
		await fs.rm(path.join(ROOT, 'data', 'files', '_test_dir'), { recursive: true, force: true });
	});

	it('GET mkfile creates file', async () => {
		const res = await app.inject({
			method: 'GET',
			url: '/engine/elfinder?cmd=mkfile&name=_test_file.txt&target=v0_Lw'
		});
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload) as Record<string, unknown>;
		expect(body.added).toBeDefined();
		expect(Array.isArray(body.added)).toBe(true);

		// Clean up
		await fs.unlink(path.join(ROOT, 'data', 'files', '_test_file.txt')).catch(() => {});
	});

	it('GET ls lists directory', async () => {
		const res = await app.inject({ method: 'GET', url: '/engine/elfinder?cmd=ls&target=v0_Lw' });
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload) as Record<string, unknown>;
		expect(body.list).toBeDefined();
		expect(Array.isArray(body.list)).toBe(true);
	});

	it('GET tree returns directory tree', async () => {
		const res = await app.inject({ method: 'GET', url: '/engine/elfinder?cmd=tree&target=v0_Lw' });
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload) as Record<string, unknown>;
		expect(body.tree).toBeDefined();
		expect(Array.isArray(body.tree)).toBe(true);
	});

	it('returns error for unknown command', async () => {
		const res = await app.inject({ method: 'GET', url: '/engine/elfinder?cmd=unknown' });
		expect(res.statusCode).toBe(500);
		const body = JSON.parse(res.payload) as Record<string, unknown>;
		expect(body.error).toBeDefined();
	});
});
