/**
 * E2E smoke test for FineCut NestJS pilot.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
// Import the compiled module: NestJS constructor injection relies on
// design:paramtypes metadata, which vitest's esbuild transform does not emit.
import { AppModule } from '../build/src/app.module.js';

describe('FineCut NestJS Pilot (e2e)', () => {
	let app: NestFastifyApplication;

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
		await app.init();
		await app.getHttpAdapter().getInstance().ready();
	});

	afterAll(async () => {
		await app.close();
	});

	it('GET /engine/health returns ok', async () => {
		const res = await app.inject({ method: 'GET', url: '/engine/health' });
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload)).toEqual({ status: 'ok', mnemonica: true });
	});

	it('GET /engine/tree returns page list', async () => {
		const res = await app.inject({ method: 'GET', url: '/engine/tree' });
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload) as Array<{ name: string }>;
		expect(Array.isArray(body)).toBe(true);
	});

	it('GET / returns homepage', async () => {
		const res = await app.inject({ method: 'GET', url: '/' });
		expect(res.statusCode).toBe(200);
		expect(res.headers['content-type']).toContain('text/html');
	});
});
