/**
 * Template list API — list available templates.
 * Ported from _adm/template.php.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { Router, type Request, type Response } from 'express';

const ROOT = process.cwd();

const router = Router();

router.get('/engine/template', async (_req: Request, res: Response) => {
	const templatesPath = path.join(ROOT, 'views', 'templates');
	const entries = await fs.readdir(templatesPath, { withFileTypes: true });

	const templates = entries
		.filter(e => e.isDirectory() && e.name !== 'default')
		.map(e => ({ name : e.name }));

	res.type('application/json').send(templates);
});

export default router;
