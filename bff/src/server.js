// tracing must load first: it patches http/express at import time
import { reportProcessError, flushTracing } from './tracing.js';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { existsSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';

// Process-level failures → Jaeger error span, then exit (standard pattern):
// an uncaught error leaves the process in undefined state — report, flush, die.
process.on('uncaughtException', async (err) => {
	reportProcessError(err, 'uncaughtException');
	console.error(err);
	await flushTracing();
	process.exit(1);
});
process.on('unhandledRejection', async (reason) => {
	if (reason instanceof Error) {
		reportProcessError(reason, 'unhandledRejection');
		console.error(reason);
		await flushTracing();
	}
	process.exit(1);
});

const __dirname = dirname(fileURLToPath(import.meta.url));

const STATIC_ROOT = process.env.STATIC_ROOT || config.STATIC_ROOT || join(__dirname, '../data/static');
const BACKEND_URL = process.env.BACKEND_URL || config.BACKEND_URL;
const PORT = Number(process.env.PORT) || 3002;

const app = express();

// Public assets served at root paths (/style.css, /javascripts/, /elfinder/, etc.)
app.use(express.static(join(__dirname, '../public')));

// Admin panel shortcuts — redirect to admin.html so relative paths resolve correctly
app.get('/admin', (_req, res) => res.redirect('/admin.html'));
app.get('/admin/admin', (_req, res) => res.redirect('/admin.html'));

// Admin panel static files
app.use('/admin/panel', express.static(join(__dirname, '../admin/panel')));

// Proxy middleware for backend
const proxy = createProxyMiddleware({
	target: BACKEND_URL,
	changeOrigin: true,
	ws: true,
});

// Generated static pages: try STATIC_ROOT first, then proxy to backend
// NOTE: app.use without path preserves req.path correctly;
// app.use('*') causes req.path to always be '/' in Express 4
app.use((req, res, next) => {
	// Skip /admin/panel — already handled above
	if (req.path.startsWith('/admin/panel')) {
		return next();
	}

	const cleanPath = req.path === '/' ? '/_index' : req.path;
	const staticPath = join(STATIC_ROOT, cleanPath, 'index.html');

	if (existsSync(staticPath)) {
		return createReadStream(staticPath).pipe(res);
	}

	// Fallback to backend proxy
	proxy(req, res, (err) => {
		if (err) {
			// eslint-disable-next-line no-console
			console.error('[BFF] proxy error:', err.message);
		}
		next(err);
	});
});

app.listen(PORT, () => {
	// eslint-disable-next-line no-console
	console.log(`FineCut-BFF listening on http://0.0.0.0:${PORT}`);
	// eslint-disable-next-line no-console
	console.log(`  STATIC_ROOT: ${STATIC_ROOT}`);
	// eslint-disable-next-line no-console
	console.log(`  BACKEND_URL: ${BACKEND_URL}`);
});
