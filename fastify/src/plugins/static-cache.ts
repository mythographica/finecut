/**
 * Static cache plugin.
 * mtime-based cache invalidation ported from PHP _engine/index.php.
 */
import path from 'path';
import { promises as fs } from 'fs';
import { settings } from '../core/settings.js';
import { fileExists, getMtime } from '../lib/fileUtils.js';
import type { PageHeader } from '../types/index.js';

const ROOT = process.cwd();

/**
 * Check if a cached static version is still valid.
 * Returns cached HTML if fresh, null if stale or missing.
 */
export async function checkStaticCache (pagePath: string, header: PageHeader | null): Promise<string | null> {
	if (!settings.use_static) return null;

	const staticFilePath = path.join(ROOT, settings.static, pagePath, 'index.html');
	if (!await fileExists(staticFilePath)) return null;

	const staticMtime = await getMtime(staticFilePath);
	const dynamicMtime = await getMtime(path.join(ROOT, settings.pages, pagePath, 'header.txt'));
	const settingsMtime = await getMtime(path.join(ROOT, 'core', 'settings.js'));
	const engineMtime = await getMtime(path.join(ROOT, 'core', 'server.js'));
	const templatePath = path.join(ROOT, 'views', 'templates', header?.template || 'default', 'index.html');
	const templateMtime = await getMtime(templatePath);

	if (staticMtime > dynamicMtime &&
	    staticMtime > settingsMtime &&
	    staticMtime > engineMtime &&
	    staticMtime > templateMtime) {
		return fs.readFile(staticFilePath, 'utf-8');
	}
	return null;
}

/**
 * Write rendered HTML to static cache.
 */
export async function writeStaticCache (pagePath: string, html: string): Promise<void> {
	if (!settings.use_static) return;

	const staticFilePath = path.join(ROOT, settings.static, pagePath, 'index.html');
	await fs.mkdir(path.dirname(staticFilePath), { recursive: true });
	await fs.writeFile(staticFilePath, html, 'utf-8');
	await fs.chmod(staticFilePath, settings.perm_file);
}
