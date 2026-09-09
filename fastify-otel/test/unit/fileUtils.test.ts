import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { getfiles, setfiles, fileExists, parseHeader, loadPageFiles } from '../../src/lib/fileUtils.js';

const TEST_DIR = './test/tmp';

describe('fileUtils', () => {
	beforeAll(async () => {
		await fs.mkdir(TEST_DIR, { recursive: true });
	});

	afterAll(async () => {
		await fs.rm(TEST_DIR, { recursive: true, force: true });
	});

	describe('getfiles', () => {
		it('reads file content', async () => {
			await fs.writeFile(path.join(TEST_DIR, 'test.txt'), 'hello', 'utf-8');
			const content = await getfiles('test.txt', TEST_DIR);
			expect(content).toBe('hello');
		});

		it('returns empty string for missing file', async () => {
			const content = await getfiles('missing.txt', TEST_DIR);
			expect(content).toBe('');
		});
	});

	describe('setfiles', () => {
		it('writes file content', async () => {
			await setfiles('write.txt', TEST_DIR, 'content');
			const content = await fs.readFile(path.join(TEST_DIR, 'write.txt'), 'utf-8');
			expect(content).toBe('content');
		});
	});

	describe('fileExists', () => {
		it('returns true for existing file', async () => {
			await fs.writeFile(path.join(TEST_DIR, 'exists.txt'), '', 'utf-8');
			const exists = await fileExists(path.join(TEST_DIR, 'exists.txt'));
			expect(exists).toBe(true);
		});

		it('returns false for missing file', async () => {
			const exists = await fileExists(path.join(TEST_DIR, 'missing.txt'));
			expect(exists).toBe(false);
		});
	});

	describe('parseHeader', () => {
		it('returns null for missing header.txt', async () => {
			const header = await parseHeader(TEST_DIR);
			expect(header).toBeNull();
		});

		it('parses valid JSON header', async () => {
			await fs.writeFile(path.join(TEST_DIR, 'header.txt'), '{"title":"Test","template":"default"}', 'utf-8');
			const header = await parseHeader(TEST_DIR);
			expect(header).toEqual({ title: 'Test', template: 'default' });
		});

		it('returns null for invalid JSON', async () => {
			await fs.writeFile(path.join(TEST_DIR, 'header.txt'), 'not-json', 'utf-8');
			const header = await parseHeader(TEST_DIR);
			expect(header).toBeNull();
		});
	});

	describe('loadPageFiles', () => {
		it('loads all page files', async () => {
			const pageDir = path.join(TEST_DIR, '_testpage');
			await fs.mkdir(pageDir, { recursive: true });
			await fs.writeFile(path.join(pageDir, 'header.txt'), '{"title":"Test Page"}', 'utf-8');
			await fs.writeFile(path.join(pageDir, 'content.txt'), 'page content', 'utf-8');
			await fs.writeFile(path.join(pageDir, 'info.txt'), '{"author":"test"}', 'utf-8');
			await fs.writeFile(path.join(pageDir, 'blocks.txt'), '[]', 'utf-8');

			const page = await loadPageFiles(pageDir);

			expect(page.header).toEqual({ title: 'Test Page' });
			expect(page.content).toBe('page content');
			expect(page.info).toEqual({ author: 'test' });
			expect(page.blocks).toEqual([]);
			expect(page.path).toBe(pageDir);
		});
	});
});
