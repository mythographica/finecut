import { describe, it, expect } from 'vitest';
import { compile, registerHelper } from '../../src/lib/templateEngine.js';
import type { TemplateContext } from '../../src/types/index.js';

function get (obj: Record<string, unknown>, path: string): unknown {
	const parts = path.split('.');
	let result: unknown = obj;
	for (const part of parts) {
		if (result == null) return undefined;
		result = (result as Record<string, unknown>)[part];
	}
	return result;
}

describe('templateEngine', () => {
	describe('compile', () => {
		it('renders simple property', () => {
			const fn = compile('Hello {{name}}');
			const result = fn({ name: 'World' } as unknown as TemplateContext, new Map(), get);
			expect(result).toBe('Hello World');
		});

		it('renders nested property', () => {
			const fn = compile('{{user.name}}');
			const result = fn({ user: { name: 'John' } } as unknown as TemplateContext, new Map(), get);
			expect(result).toBe('John');
		});

		it('renders empty string for missing property', () => {
			const fn = compile('{{missing}}');
			const result = fn({} as TemplateContext, new Map(), get);
			expect(result).toBe('');
		});

		it('renders conditional when true', () => {
			const fn = compile('{{#if show}}visible{{/if}}');
			const result = fn({ show: true } as unknown as TemplateContext, new Map(), get);
			expect(result).toBe('visible');
		});

		it('skips conditional when false', () => {
			const fn = compile('{{#if show}}visible{{/if}}');
			const result = fn({ show: false } as unknown as TemplateContext, new Map(), get);
			expect(result).toBe('');
		});

		it('renders negated conditional when false', () => {
			const fn = compile('{{#if !hidden}}visible{{/if}}');
			const result = fn({ hidden: false } as unknown as TemplateContext, new Map(), get);
			expect(result).toBe('visible');
		});

		it('skips negated conditional when true', () => {
			const fn = compile('{{#if !hidden}}visible{{/if}}');
			const result = fn({ hidden: true } as unknown as TemplateContext, new Map(), get);
			expect(result).toBe('');
		});

		it('renders helper', () => {
			registerHelper('testHelper', () => 'helper-output');
			const fn = compile('{{>testHelper}}');
			const result = fn({} as TemplateContext, new Map([['testHelper', () => 'helper-output']]), get);
			expect(result).toBe('helper-output');
		});

		it('renders logo link conditional for non-main page', () => {
			const template = '{{#if !isMain}}<a href="/">{{/if}}<img>{{#if !isMain}}</a>{{/if}}';
			const fn = compile(template);
			const result = fn({ isMain: false } as unknown as TemplateContext, new Map(), get);
			expect(result).toBe('<a href="/"><img></a>');
		});

		it('skips logo link for main page', () => {
			const template = '{{#if !isMain}}<a href="/">{{/if}}<img>{{#if !isMain}}</a>{{/if}}';
			const fn = compile(template);
			const result = fn({ isMain: true } as unknown as TemplateContext, new Map(), get);
			expect(result).toBe('<img>');
		});
	});
});
