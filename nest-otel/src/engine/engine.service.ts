/**
 * EngineService — Admin API business logic.
 *
 * Mirrors finecutnode/src/routes/engine/*.ts + lib utilities.
 */
import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';
import { settings } from '../core/settings.js';
import { paths as resolvePaths, removeRecursive, fileExists, mkdirp } from '../lib/fileUtils.js';
import {
	handleContentGet,
	handleContentSet,
	handleSet,
	handleMkdir,
	handleDel,
} from '../lib/engineActions.js';
import type { Settings } from '../types/index.js';
import type { TreeItem } from '../core/engine-types.js';

const ROOT = process.cwd();
const SETTINGS_PATH = path.join(ROOT, 'data', 'settings.json');

@Injectable()
export class EngineService {
	// Settings
	async loadSettings (): Promise<Settings> {
		try {
			const raw = await fs.readFile(SETTINGS_PATH, 'utf-8');
			return { ...settings, ...JSON.parse(raw) } as Settings;
		} catch {
			return settings;
		}
	}

	async saveSettings (partial: Partial<Settings>): Promise<Settings> {
		const merged = { ...settings, ...partial };
		await fs.writeFile(SETTINGS_PATH, JSON.stringify(merged, null, '\t'), 'utf-8');
		return merged as Settings;
	}

	// Tree
	async getPageTree (leaf = ''): Promise<TreeItem[]> {
		const pagesPath = resolvePaths(leaf);
		const entries = await fs.readdir(pagesPath, { withFileTypes: true });
		return Promise.all(
			entries
				.filter((e) => e.isDirectory())
				.map(async (e) => {
					const subEntries = await fs
						.readdir(path.join(pagesPath, e.name), { withFileTypes: true })
						.catch(() => []);
					const hasSubdirs = subEntries.some((se) => se.isDirectory());
					return { name: e.name, folder: hasSubdirs };
				})
		);
	}

	// Page actions (delegated to engineActions)
	async handleContentGet (leaf: string) {
		return handleContentGet(leaf);
	}

	async handleContentSet (leaf: string, data: Record<string, unknown>) {
		return handleContentSet(leaf, data);
	}

	async handleSet (leaf: string, pageName: string, data?: Record<string, unknown>) {
		return handleSet(leaf, pageName, data);
	}

	async handleMkdir (leaf: string, pageName: string) {
		return handleMkdir(leaf, pageName);
	}

	async handleDel (leaf: string, pageName: string) {
		return handleDel(leaf, pageName);
	}

	// Templates
	async getTemplates (): Promise<Array<{ name: string }>> {
		const templatesPath = path.join(ROOT, 'views', 'templates');
		const entries = await fs.readdir(templatesPath, { withFileTypes: true });
		return entries
			.filter((e) => e.isDirectory() && e.name !== 'default')
			.map((e) => ({ name: e.name }));
	}

	async readTemplate (templateName: string): Promise<{ source: string; snippet: string; header: string } | null> {
		const templatePath = path.join(ROOT, 'views', 'templates', templateName);
		if (!await fileExists(templatePath)) {
			return null;
		}
		const { getfiles } = await import('../lib/fileUtils.js');
		const indexPath = path.join(templatePath, 'index.html');
		const snippetPath = path.join(templatePath, 'snippet.txt');
		const headerPath = path.join(templatePath, 'header.txt');
		return {
			source  : await fileExists(indexPath) ? await getfiles('index.html', templatePath) : '',
			snippet : await fileExists(snippetPath) ? await getfiles('snippet.txt', templatePath) : '',
			header  : await fileExists(headerPath) ? await getfiles('header.txt', templatePath) : '',
		};
	}

	async addTemplate (
		templateName: string, source: string, snippet: string, header: string
	): Promise<boolean> {
		const templatePath = path.join(ROOT, 'views', 'templates', templateName);
		if (await fileExists(templatePath)) {
			return false;
		}
		await mkdirp(templatePath);
		await this.writeTemplate(templatePath, source, snippet, header);
		return true;
	}

	async saveTemplate (
		templateName: string, source: string, snippet: string, header: string
	): Promise<boolean> {
		const templatePath = path.join(ROOT, 'views', 'templates', templateName);
		if (!await fileExists(templatePath)) {
			return false;
		}
		await this.writeTemplate(templatePath, source, snippet, header);
		return true;
	}

	async deleteTemplate (templateName: string): Promise<boolean> {
		const templatePath = path.join(ROOT, 'views', 'templates', templateName);
		return removeRecursive(templatePath);
	}

	private async writeTemplate (
		templatePath: string, source: string, snippet: string, header: string
	): Promise<void> {
		const { setfiles } = await import('../lib/fileUtils.js');
		await Promise.all([
			setfiles('index.html', templatePath, source),
			setfiles('snippet.txt', templatePath, snippet),
			setfiles('header.txt', templatePath, header),
		]);
	}

	// Cache
	async clearCache (): Promise<boolean> {
		const staticPath = path.join(ROOT, settings.static);
		return removeRecursive(staticPath);
	}

	// Settings helpers
	getPagesPath (): string {
		return settings.pages;
	}

	async handleSettings (dataVal: string): Promise<string> {
		if (dataVal) {
			let storeVal = dataVal;
			try {
				const parsed = JSON.parse(dataVal) as Record<string, unknown>;
				if (parsed.val !== undefined) {
					storeVal = String(parsed.val);
				}
			} catch { /* not wrapped, store as-is */ }
			if (storeVal !== '') {
				await fs.writeFile(SETTINGS_PATH, storeVal, 'utf-8');
			}
		}
		return fs.readFile(SETTINGS_PATH, 'utf-8');
	}
}
