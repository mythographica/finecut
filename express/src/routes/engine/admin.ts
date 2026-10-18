/**
 * Admin panel route — elFinder backend via the elfinder-node connector
 * router + redirect to the static admin page.
 *
 * elfinder-node 2.3.x wires a volume through its own Router: `elfinder(roots)`
 * owns the driver registry (an app-owned one would never serve requests),
 * validates the connector options (yup), parses multipart uploads (busboy)
 * and streams downloads through the response — the hand-rolled cmd dispatch
 * this file used to carry is the library's job now.
 */
import { Router, type Request, type Response } from 'express';
import { elfinder, LocalFileStorage } from 'elfinder-node';

const ROOT = process.cwd();

// path rides inside the root object into the LFS driver setup (the
// VolumeRoot type lags the README — the variable literal keeps it
// structurally assignable).
const roots = [
	{
		driver: LocalFileStorage,
		path: ROOT,
		URL: '/',
		permissions: { read: 1, write: 1, locked: 0 },
	}
];

const router = Router();

// Redirect /engine/admin to the static admin page
router.get('/engine/admin', (_req: Request, res: Response) => {
	res.redirect('/admin.html');
});

// elFinder connector — the library's own router
router.use('/engine/elfinder', elfinder(roots));

export default router;
