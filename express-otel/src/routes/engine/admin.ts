/**
 * Admin panel route — elFinder backend via elfinder-node + redirect to static admin page.
 */
import { Router, type Request, type Response } from 'express';
import { LFS, driverRegistry } from 'elfinder-node';

const ROOT = process.cwd();

const roots = [
	{
		driver: LFS,
		path: ROOT,
		URL: '/',
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

async function handleElfinder (req: Request, res: Response): Promise<void> {
	const query = req.query as Record<string, string>;
	const body = (req.body || {}) as Record<string, unknown>;
	const cmd = query.cmd || (body.cmd as string);
	const params = convertParams(query, body);

	try {
		const driver = driverRegistry.getDriverForRequest(params);
		if (typeof (driver as Record<string, unknown>)[cmd] !== 'function') {
			throw new Error(`'${cmd}' is not implemented by volume driver`);
		}
		const result = await (driver as Record<string, CallableFunction>)[cmd](params);
		res.type('application/json').send(result);
	} catch (e: unknown) {
		const message = e instanceof Error ? e.message : 'Unknown error';
		res.type('application/json').status(500).send({ error: message });
	}
}

const router = Router();

// Redirect /engine/admin to the static admin page
router.get('/engine/admin', (_req: Request, res: Response) => {
	res.redirect('/admin.html');
});

// elFinder connector via elfinder-node driver registry
router.get('/engine/elfinder', handleElfinder);
router.post('/engine/elfinder', handleElfinder);

export default router;
