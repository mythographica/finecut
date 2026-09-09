/**
 * Template component helpers.
 * Pure functions that generate HTML fragments from page context.
 */
import path from 'path';
import { promises as fs } from 'fs';
import { fileExists } from './fileUtils.js';
import type { PageContext } from '../types/index.js';

const ROOT = process.cwd();

/**
 * Generate meta tags from page info metadata.
 */
export function jsonInfo (ctx: PageContext): string {
	const info = ctx.info || {};
	const lines: string[] = [];
	if (info.meta && typeof info.meta === 'object') {
		for (const [key, value] of Object.entries(info.meta as Record<string, string>)) {
			lines.push(`<meta name="${key}" content="${value}">`);
		}
	}
	return lines.join('\n');
}

/**
 * Additional head content placeholder.
 */
export function headAdditional (): string {
	return '';
}

/**
 * Parse page content — returns raw content.
 */
export async function contentParser (ctx: PageContext): Promise<string> {
	let content = ctx.content || '';
	if (ctx.header?.pageIsCode) {
		return content;
	}
	// Rewrite absolute URLs to include deep prefix (ported from PHP preparseContentStr)
	if (ctx.deep) {
		content = content.replace(/href="\//g, `href="${ctx.deep}/`);
		content = content.replace(/href = "\//g, `href = "${ctx.deep}/`);
		content = content.replace(/src="\//g, `src="${ctx.deep}/`);
		content = content.replace(/src = "\//g, `src = "${ctx.deep}/`);
	}
	// Escape template delimiters so examples like {{var}} render literally
	// without being processed by the template engine
	content = content.replace(/\{\{/g, '&#123;&#123;').replace(/\}\}/g, '&#125;&#125;');
	return content;
}

/**
 * Render main navigation menu.
 */
export async function menuMain (ctx: PageContext): Promise<string> {
	const menuFile = path.join(ROOT, 'data', 'menu_main.json');
	if (!await fileExists(menuFile)) return '';

	const raw = await fs.readFile(menuFile, 'utf-8').catch(() => '[]');
	const menu = JSON.parse(raw) as Array<{
		type: string;
		link: string;
		title: string;
		menu?: Array<{ type: string; link: string; title: string }>;
	}>;
	const activeLink = ctx.pagePath?.split('/')[1] || '';

	const items = menu.map((item) => {
		if (item.type !== 'link') return '';
		const isActive = item.link === `/${activeLink}/`;
		if (item.menu) {
			const subItems = item.menu.map((sub) => {
				if (sub.type === 'link') {
					return `<li><a href="${ctx.deep}${sub.link}">${sub.title}</a></li>`;
				}
				if (sub.type === 'divider') return '<li class="divider"></li>';
				if (sub.type === 'header') return `<li class="nav-header">${sub.title}</li>`;
				return '';
			}).join('');
			return `
				<li class="dropdown ${isActive ? 'active' : ''}">
					<a href="#" class="dropdown-toggle" data-toggle="dropdown">${item.title}<b class="caret"></b></a>
					<ul class="dropdown-menu">${subItems}</ul>
				</li>`;
		}
		return `<li class="${isActive ? 'active' : ''}"><a href="${ctx.deep}${item.link}">${item.title}</a></li>`;
	});

	return items.join('');
}

/**
 * Render left sidebar menu.
 */
export async function menuLeft (ctx: PageContext): Promise<string> {
	const menuFile = path.join(ROOT, 'data', 'menu_left.json');
	if (!await fileExists(menuFile)) return '';

	const raw = await fs.readFile(menuFile, 'utf-8').catch(() => '[]');
	const menu = JSON.parse(raw) as Array<{
		type: string;
		link: string;
		title: string;
		menu?: Array<{ type: string; link: string; title: string }>;
	}>;
	const activeLink = ctx.pagePath || '/';

	const items = menu.map((item) => {
		if (item.type !== 'link') return '';
		const isActive = item.link === activeLink;
		if (item.menu) {
			const subItems = item.menu.map((sub) => {
				if (sub.type === 'link') {
					const subActive = sub.link === activeLink;
					const href = `${ctx.deep}${sub.link}`;
					const cls = subActive ? 'active' : '';
					return `<li><a href="${href}" class="${cls}">${sub.title}</a></li>`;
				}
				if (sub.type === 'divider') return '<li class="divider"></li>';
				if (sub.type === 'header') return `<li class="header">${sub.title}</li>`;
				return '';
			}).join('');
			return `
				<li><a href="${ctx.deep}${item.link}" class="${isActive ? 'active' : ''}">${item.title}</a>
				<ul>${subItems}</ul></li>`;
		}
		return `<li><a href="${ctx.deep}${item.link}" class="${isActive ? 'active' : ''}">${item.title}</a></li>`;
	});

	return items.join('');
}

/**
 * Recursively list documentation pages.
 * Ported from components/menu_documents/index.php.
 */
export async function menuDocuments (_ctx: PageContext): Promise<string> {
	const docsPath = path.join(ROOT, 'data', 'pages', 'documentation');
	if (!await fileExists(docsPath)) return '';

	async function readDirs (dir: string, prefix: string): Promise<string> {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		const items: string[] = [];
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const entryPath = path.join(dir, entry.name);
			const headerPath = path.join(entryPath, 'header.txt');
			let title = entry.name;
			if (await fileExists(headerPath)) {
				const headerRaw = await fs.readFile(headerPath, 'utf-8').catch(() => '{}');
				try {
					const header = JSON.parse(headerRaw) as { title?: string };
					if (header.title) title = header.title;
				} catch { /* ignore */ }
			}
			const link = prefix ? `${prefix}/${entry.name}` : entry.name;
			items.push(`<li><a href="/${link}/">${title}</a></li>`);
			items.push(await readDirs(entryPath, link));
		}
		return items.join('');
	}

	return `<ol>${await readDirs(docsPath, 'documentation')}</ol>`;
}
