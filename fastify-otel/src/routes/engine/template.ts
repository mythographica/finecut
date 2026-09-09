/**
 * Template list API — list available templates.
 * Ported from _adm/template.php.
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { FastifyRequest, FastifyReply } from 'fastify';

const ROOT = process.cwd();

type AppGet = {
	get: (p: string, h: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>) => void;
};

export default async function (app: AppGet): Promise<void> {

	app.get('/engine/template', async (_req: FastifyRequest, reply: FastifyReply) => {
		const templatesPath = path.join(ROOT, 'views', 'templates');
		const entries = await fs.readdir(templatesPath, { withFileTypes: true });

		const templates = entries
			.filter(e => e.isDirectory() && e.name !== 'default')
			.map(e => ({ name : e.name }));

		return reply.type('application/json').send(templates);
	});
}
