/**
 * Minimal inject-style test helper for Express 5.
 * Express has no app.inject() like Fastify — start the app on an
 * ephemeral port and hit it with plain fetch. No extra dependencies.
 */
import type { Express } from 'express';
import type { Server } from 'http';

export interface InjectOptions {
	method : string;
	url    : string;
	payload?: unknown;
}

export interface InjectResult {
	statusCode : number;
	headers    : Record<string, string>;
	payload    : string;
}

export interface TestApp {
	server  : Server;
	baseUrl : string;
	inject  : (opts: InjectOptions) => Promise<InjectResult>;
	close   : () => Promise<void>;
}

export async function startTestApp (app: Express): Promise<TestApp> {
	const server = await new Promise<Server>((resolve) => {
		const s = app.listen(0, '127.0.0.1', () => resolve(s));
	});
	const address = server.address();
	if (address === null || typeof address === 'string') {
		throw new Error('Could not determine test server port');
	}
	const baseUrl = `http://127.0.0.1:${address.port}`;

	const inject = async (opts: InjectOptions): Promise<InjectResult> => {
		const res = await fetch(baseUrl + opts.url, {
			method  : opts.method,
			headers : opts.payload !== undefined
				? { 'content-type': 'application/json' }
				: undefined,
			body : opts.payload !== undefined
				? JSON.stringify(opts.payload)
				: undefined
		});
		const payload = await res.text();
		const headers: Record<string, string> = {};
		res.headers.forEach((value, key) => {
			headers[key] = value;
		});
		return { statusCode: res.status, headers, payload };
	};

	const close = async (): Promise<void> => {
		await new Promise<void>((resolve, reject) => {
			server.close(err => err ? reject(err) : resolve());
		});
	};

	return { server, baseUrl, inject, close };
}
