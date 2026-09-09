/**
 * AdminController — elFinder backend + admin redirect.
 *
 * Mirrors finecutnode/src/routes/engine/admin.ts
 */
import { Controller, Get, Post, Query, Body, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { LFS, driverRegistry } from 'elfinder-node';

const ROOT = process.cwd();

const roots = [
	{
		driver: LFS,
		path  : ROOT,
		URL   : '/',
		permissions: { read: 1, write: 1, locked: 0 },
	}
];

driverRegistry.initialize(roots);

function convertParams (
	query: Record<string, string>,
	body: Record<string, unknown>
): Record<string, unknown> {
	const raw = Object.keys(body).length > 0 ? body : query;
	const params: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(raw)) {
		if (value === 'null' || value === 'undefined') {
			params[key] = null;
		} else if (value === 'true') {
			params[key] = true;
		} else if (value === 'false') {
			params[key] = false;
		} else if (value === '1' || value === 1) {
			params[key] = 1;
		} else if (value === '0' || value === 0) {
			params[key] = 0;
		} else {
			params[key] = value;
		}
	}

	const arrKeys = ['targets', 'renames', 'upload_path'];
	for (const k of arrKeys) {
		if (params[k] !== undefined && !Array.isArray(params[k])) {
			params[k] = [params[k]];
		}
	}

	return params;
}

@Controller('engine')
export class AdminController {
	@Get('admin')
	async adminRedirect (@Res() res: FastifyReply) {
		return res.redirect('/admin.html');
	}

	@Get('elfinder')
	async getElfinder (
		@Query() query: Record<string, string>,
		@Res() res: FastifyReply,
	) {
		return this.handleElfinder(query, {}, res);
	}

	@Post('elfinder')
	async postElfinder (
		@Query() query: Record<string, string>,
		@Body() body: Record<string, unknown>,
		@Res() res: FastifyReply,
	) {
		return this.handleElfinder(query, body, res);
	}

	private async handleElfinder (
		query: Record<string, string>,
		body: Record<string, unknown>,
		res: FastifyReply,
	): Promise<void> {
		const cmd = query.cmd || (body.cmd as string);
		const params = convertParams(query, body);

		try {
			const driver = driverRegistry.getDriverForRequest(params);
			if (typeof (driver as Record<string, unknown>)[cmd] !== 'function') {
				throw new Error(`'${cmd}' is not implemented by volume driver`);
			}
			const result = await (driver as Record<string, CallableFunction>)[cmd](params);
			return res.type('application/json').send(result);
		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : 'Unknown error';
			return res.type('application/json').code(500).send({ error: message });
		}
	}
}
