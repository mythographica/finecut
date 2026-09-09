// Generated TypeRegistry for type-safe mnemonica.lookup()
// This file augments mnemonica's TypeRegistry via declaration merging.
//
// Usage:
//   import { lookup } from 'mnemonica';
//   import './.tactica/registry';  // applies the augmentation
//   const Sentience = lookup('Sentience');
//   // TypeScript knows: Sentience is a constructor for SentienceInstance
//   const instance = new Sentience({ purpose: 'AI' });
//   // instance has full intellisense for Consciousness, Memory, etc.

import type {
	RequestData,
	RequestData_RouteData,
	RequestData_RouteData_PageData,
	RequestData_RouteData_PageData_RenderData,
	RequestData_RouteData_PageData_RenderData_ResponseData,
	EngineRequest,
	EngineRequest_TreeResult,
	EngineRequest_PageResult,
	EngineRequest_CacheResult,
	EngineRequest_TemplateResult,
} from './types.js';

/**
 * Type registry augmenting mnemonica's TypeRegistry interface
 * This enables type-safe lookup() without explicit type arguments
 *
 * Usage: const SomeType = lookup('SomeType'); // Fully typed!
 */
declare module 'mnemonica' {
	interface TypeRegistry {
		'RequestData': new (req: { method: string; url: string; query: Record<string, unknown>; params: Record<string, unknown>; body: Record<string, unknown>; headers: Record<string, unknown>; id: string }) => RequestData;
		'RequestData.RouteData': new (routeInfo: { pagePath: string; isMain: boolean; deep: string }) => RequestData_RouteData;
		'RequestData.RouteData.PageData': new (pageFiles: { header: { title: string; template: string; pageIsCode: boolean; keywords: string; description: string; additional: string } | null; content: string; info: Record<string, unknown>; blocks: Array<{ name: string; value: string }>; path: string }) => RequestData_RouteData_PageData;
		'RequestData.RouteData.PageData.RenderData': new (components: Record<string, string | Promise<string>>) => RequestData_RouteData_PageData_RenderData;
		'RequestData.RouteData.PageData.RenderData.ResponseData': new (output: { body: string; contentType: string; statusCode: number; fromCache: boolean }) => RequestData_RouteData_PageData_RenderData_ResponseData;
		'EngineRequest': new (req: { body: Record<string, unknown> }) => EngineRequest;
		'EngineRequest.TreeResult': new (result: { tree: Array<{ name: string; folder?: boolean }> }) => EngineRequest_TreeResult;
		'EngineRequest.PageResult': new (pageData: { header: string; content: string; info: string; blocks: string }) => EngineRequest_PageResult;
		'EngineRequest.CacheResult': new (cleared: boolean) => EngineRequest_CacheResult;
		'EngineRequest.TemplateResult': new (templateData: { source?: string; snippet?: string; header?: string }) => EngineRequest_TemplateResult;
	}
}

import type { TypeRegistry } from 'mnemonica';
export type { TypeRegistry };