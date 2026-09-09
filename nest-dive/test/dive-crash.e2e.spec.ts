/**
 * E2E test for the crash-and-retrieve dive demo.
 *
 * Proves the headline capability: code fails with a REAL uncaughtException /
 * unhandledRejection (escaping every Nest boundary), the process survives,
 * and the exact failed mnemonica instance — its data and its execution flow —
 * is retrievable afterwards over HTTP.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
// Import the compiled module: NestJS constructor injection relies on
// design:paramtypes metadata, which vitest's esbuild transform does not emit.
import { AppModule } from '../build/src/app.module.js';

type CrashReportPayload = {
	uuid: string;
	retrieved: boolean;
	errorName: string;
	errorMessage: string;
	instanceType: string | null;
	instanceData: Record<string, unknown>;
	flow: Array<{ name: string; kind: string; status: string }>;
};

describe('Dive crash-and-retrieve demo (e2e)', () => {
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

	async function pollReport (uuid: string): Promise<CrashReportPayload> {
		for (let attempt = 0; attempt < 60; attempt++) {
			const res = await app.inject({
				method : 'GET',
				url    : `/engine/dive-crash-report?uuid=${uuid}`
			});
			if (res.statusCode === 200) {
				const result = JSON.parse(res.payload) as CrashReportPayload;
				return result;
			}
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 50);
			});
		}
		throw new Error(`report for ${uuid} never appeared`);
	}

	async function expectCrashRetrieval (mode: 'sync' | 'async', messagePart: string) {
		const start = await app.inject({ method: 'GET', url: `/engine/dive-crash?mode=${mode}` });
		expect(start.statusCode).toBe(200);
		const { uuid } = JSON.parse(start.payload) as { uuid: string };
		expect(uuid).toContain('crash-demo-');

		const report = await pollReport(uuid);

		// the exact failed instance was retrieved from the process-level error
		expect(report.retrieved).toBe(true);
		expect(report.uuid).toBe(uuid);
		expect(report.instanceType).toBe('CrashDemoEntity');
		expect(report.errorMessage).toContain(messagePart);

		// the data the instance carried survived the crash
		expect(report.instanceData.uuid).toBe(uuid);
		expect(report.instanceData.payload).toBe('demo-payload');

		// the flight recorder names the branch that produced the error
		const names = report.flow.map((edge) => edge.name);
		expect(names).toContain('CrashDemoEntity');
		expect(names).toContain('run');
		expect(report.flow.some((edge) => edge.status === 'error')).toBe(true);

		// and the process is very much alive afterwards
		const health = await app.inject({ method: 'GET', url: '/engine/health' });
		expect(health.statusCode).toBe(200);
	}

	it('sync uncaughtException → failed instance + flow retrieved, server survives', async () => {
		await expectCrashRetrieval('sync', 'uncaught exception');
	});

	it('async unhandledRejection → failed instance + flow retrieved, server survives', async () => {
		await expectCrashRetrieval('async', 'unhandled rejection');
	});
});
