/**
 * File utilities for FineCut CMS.
 * Pure functions for file I/O — testable with mocked fs.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { settings } from '../core/settings.js';
import type { PageFiles, PageHeader } from '../types/index.js';

type BlockItem = { name: string; value: string };

const ROOT = process.cwd();

/**
 * Read a file from a directory.
 */
export async function getfiles (name: string, dirPath: string): Promise<string> {
	const filePath = path.join(dirPath, name);
	try {
		return await fs.readFile(filePath, 'utf-8');
	} catch {
		return '';
	}
}

/**
 * Write a file to a directory.
 */
export async function setfiles (name: string, dirPath: string, content: string): Promise<void> {
	const filePath = path.join(dirPath, name);
	await fs.writeFile(filePath, content, 'utf-8');
	await fs.chmod(filePath, settings.perm_file);
}

/**
 * Check if a file or directory exists.
 */
export async function fileExists (filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Get file modification time as timestamp.
 */
export async function getMtime (filePath: string): Promise<number> {
	try {
		const stat = await fs.stat(filePath);
		return stat.mtime.getTime();
	} catch {
		return 0;
	}
}

/**
 * Create directory recursively.
 */
export async function mkdirp (dirPath: string): Promise<void> {
	await fs.mkdir(dirPath, { recursive: true, mode: settings.perm_folder });
}

/**
 * Recursively remove a file or directory.
 */
export async function removeRecursive (targetPath: string): Promise<boolean> {
	const stat = await fs.stat(targetPath).catch(() => null);
	if (!stat) return true;

	if (stat.isDirectory()) {
		const entries = await fs.readdir(targetPath);
		for (const entry of entries) {
			if (entry === '.' || entry === '..') continue;
			await removeRecursive(path.join(targetPath, entry));
		}
		await fs.rmdir(targetPath);
	} else {
		await fs.unlink(targetPath);
	}
	return true;
}

/**
 * Resolve a leaf path to the pages directory.
 */
export function paths (leaf: string): string {
	const pagesPath = path.join(ROOT, settings.pages);
	if (!leaf || leaf === '/') return pagesPath;
	// Strip /top prefix like original PHP: preg_replace('/\/top/', $pages, $leaf, 1)
	const cleanLeaf = leaf.replace(/^\/top/, '');
	if (!cleanLeaf || cleanLeaf === '/') return pagesPath;
	return path.join(pagesPath, cleanLeaf);
}

/**
 * Parse header.txt from a page directory.
 */
export async function parseHeader (dirPath: string): Promise<PageHeader | null> {
	const content = await getfiles('header.txt', dirPath);
	if (!content) return null;
	try {
		return JSON.parse(content) as PageHeader;
	} catch {
		return null;
	}
}

/**
 * Load all page files for a given page path.
 */
export async function loadPageFiles (pagePath: string): Promise<PageFiles> {
	const [header, content, infoRaw, blocksRaw] = await Promise.all([
		parseHeader(pagePath),
		getfiles('content.txt', pagePath),
		getfiles('info.txt', pagePath),
		getfiles('blocks.txt', pagePath)
	]);

	const info: Record<string, unknown> = infoRaw
		? JSON.parse(infoRaw) as Record<string, unknown>
		: {};
	const blocks: BlockItem[] = blocksRaw
		? JSON.parse(blocksRaw) as BlockItem[]
		: [];

	return { header, content, info, blocks, path: pagePath };
}
