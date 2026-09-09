/**
 * Application settings.
 * Ported from _adm/settings.php.
 */
import type { Settings } from '../types/index.js';

export const settings: Settings = {
	pages            : '../fastify/data/pages',
	use_static       : true,
	static           : '../bff/data/static',
	perm_folder      : 0o755,
	perm_file        : 0o644,
	fileNameEncoding : 'UTF-8',
	microtimeEcho    : true
};
