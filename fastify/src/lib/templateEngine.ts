/**
 * Minimal template engine.
 * Syntax:
 *   {{obj.path}}        — property access
 *   {{#if obj.path}}...{{/if}}  — conditional
 *   {{#if !obj.path}}...{{/if}} — negated conditional
 *   {{>helperName}}     — partial include (registered helper)
 */
import type { TemplateContext, HelperFn } from '../types/index.js';

const helpers = new Map<string, HelperFn>();

export function registerHelper (name: string, fn: HelperFn): void {
	helpers.set(name, fn);
}

function get (obj: Record<string, unknown>, path: string): unknown {
	const parts = path.split('.');
	let result: unknown = obj;
	for (const part of parts) {
		if (result == null) return undefined;
		result = (result as Record<string, unknown>)[part];
	}
	return result;
}

export function compile (template: string): (
	ctx: TemplateContext,
	helpersMap: Map<string, HelperFn>,
	getFn: typeof get
) => string {
	const escaped = template
		.replace(/\\/g, '\\\\')
		.replace(/`/g, '\\`')
		.replace(/\$/g, '\\$');

	const code = escaped
		.replace(/\{\{#if\s+!([^}]+)\}\}/g, '\${!get(ctx, \'$1\') ? `')
		.replace(/\{\{#if\s+([^}]+)\}\}/g, '\${get(ctx, \'$1\') ? `')
		.replace(/\{\{\/if\}\}/g, '` : \'\'}')
		.replace(/\{\{>(\w+)\}\}/g, '\${helpers.get(\'$1\')?.(ctx) ?? \'\'}')
		.replace(/\{\{([^}]+)\}\}/g, '\${get(ctx, \'$1\') ?? \'\'}');

	return new Function('ctx', 'helpers', 'get', `return \`${code}\`;`) as (
		ctx: TemplateContext,
		helpersMap: Map<string, HelperFn>,
		getFn: typeof get
	) => string;
}

export async function render (templatePath: string, context: TemplateContext): Promise<string> {
	const { promises: fs } = await import('fs');
	let template = await fs.readFile(templatePath, 'utf-8');

	// Pre-resolve helper partials ({{>helperName}}) before compilation.
	// Helpers may be async; the compiled function is synchronous.
	const helperPattern = /\{\{>(\w+)\}\}/g;
	let match: RegExpExecArray | null;
	const replacements: Array<{ match: string; result: string }> = [];
	while ((match = helperPattern.exec(template)) !== null) {
		const name = match[1];
		const fn = helpers.get(name);
		if (fn) {
			const result = await fn(context);
			replacements.push({ match: match[0], result: String(result ?? '') });
		}
	}
	for (const r of replacements) {
		template = template.replace(r.match, r.result);
	}

	const fn = compile(template);
	return fn(context, helpers, get);
}
