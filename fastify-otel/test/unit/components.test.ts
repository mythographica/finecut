import { describe, it, expect } from 'vitest';
import { jsonInfo, headAdditional, contentParser } from '../../src/lib/components.js';
import type { TemplateContext } from '../../src/types/index.js';

describe('components', () => {
	describe('jsonInfo', () => {
		it('renders meta tags from info', () => {
			const ctx = {
				info: {
					meta: {
						author: 'Test Author',
						viewport: 'width=device-width'
					}
				}
			} as unknown as TemplateContext;
			const result = jsonInfo(ctx);
			expect(result).toContain('<meta name="author" content="Test Author">');
			expect(result).toContain('<meta name="viewport" content="width=device-width">');
		});

		it('returns empty string when no meta', () => {
			const ctx = { info: {} } as unknown as TemplateContext;
			const result = jsonInfo(ctx);
			expect(result).toBe('');
		});

		it('returns empty string when info is empty', () => {
			const ctx = { info: {} } as unknown as TemplateContext;
			const result = jsonInfo(ctx);
			expect(result).toBe('');
		});
	});

	describe('headAdditional', () => {
		it('returns empty string', () => {
			const result = headAdditional();
			expect(result).toBe('');
		});
	});

	describe('contentParser', () => {
		it('returns content when pageIsCode is true', async () => {
			const ctx = {
				header: { pageIsCode: true },
				content: 'code content'
			} as unknown as TemplateContext;
			const result = await contentParser(ctx);
			expect(result).toBe('code content');
		});

		it('returns content when pageIsCode is false', async () => {
			const ctx = {
				header: { pageIsCode: false },
				content: 'regular content'
			} as unknown as TemplateContext;
			const result = await contentParser(ctx);
			expect(result).toBe('regular content');
		});

		it('returns empty string when no content', async () => {
			const ctx = {
				header: { pageIsCode: false }
			} as unknown as TemplateContext;
			const result = await contentParser(ctx);
			expect(result).toBe('');
		});
	});
});
