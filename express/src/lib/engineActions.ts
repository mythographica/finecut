/**
 * Shared engine action handlers.
 * Extracted from api.ts and tree_pages.ts to eliminate duplication.
 */
import path from 'path';
import { removeRecursive, fileExists, mkdirp, paths as resolvePaths } from './fileUtils.js';
import { getPage, setPage, rawPageFiles } from './pageStore.js';

export async function handleContentGet (leaf: string): Promise<{ page: rawPageFiles; status: true }> {
	const pagesPath = resolvePaths(leaf);
	if (!await fileExists(pagesPath)) {
		throw new Error('404:Page not found');
	}
	const page = await getPage(pagesPath);
	return { page, status: true };
}

export async function handleContentSet (
	leaf: string,
	data: Record<string, unknown>
): Promise<{ page: rawPageFiles; status: true }> {
	const target = resolvePaths(leaf);
	const page = await setPage(target, data);
	return { page, status: true };
}

export async function handleSet (
	leaf: string, pageName: string, data?: Record<string, unknown>
): Promise<{ status: true }> {
	const target = path.join(resolvePaths(leaf), pageName);
	if (await fileExists(target)) {
		throw new Error('409:Page already exists');
	}
	await mkdirp(target);
	if (data) {
		await setPage(target, data);
	}
	return { status: true };
}

export async function handleMkdir (leaf: string, pageName: string): Promise<{ status: true }> {
	const target = path.join(resolvePaths(leaf), pageName);
	await mkdirp(target);
	return { status: true };
}

export async function handleDel (leaf: string, pageName: string): Promise<{ success: boolean }> {
	const target = path.join(resolvePaths(leaf), pageName);
	const ok = await removeRecursive(target);
	return { success: ok };
}
