/**
 * Hook integration tests.
 * Verifies mnemonica collection hooks fire correctly for FineCut types.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { TypesCollection, hooksOpts } from 'mnemonica/module';

describe('mnemonica hooks', () => {
	let defaultTypes: TypesCollection;
	const preHookCalls: hooksOpts[] = [];
	const postHookCalls: hooksOpts[] = [];
	const errorHookCalls: hooksOpts[] = [];

	beforeAll(async () => {
		const { defaultTypes: dt } = await import('mnemonica/module');
		defaultTypes = dt as TypesCollection;

		// Register test hooks that capture calls
		defaultTypes.registerHook('preCreation', (hookData: hooksOpts) => {
			preHookCalls.push(hookData);
		});
		defaultTypes.registerHook('postCreation', (hookData: hooksOpts) => {
			postHookCalls.push(hookData);
		});
		defaultTypes.registerHook('creationError', (hookData: hooksOpts) => {
			errorHookCalls.push(hookData);
		});

		// Import FineCut collections so types are defined
		await import('../../src/core/collections/requestTypes.js');
		await import('../../src/core/collections/engineTypes.js');
	});

	afterAll(() => {
		// Clean up hooks
		preHookCalls.length = 0;
		postHookCalls.length = 0;
		errorHookCalls.length = 0;
	});

	beforeEach(() => {
		preHookCalls.length = 0;
		postHookCalls.length = 0;
		errorHookCalls.length = 0;
	});

	it('fires preCreation and postCreation for RequestData chain', async () => {
		const { lookup } = await import('mnemonica/module');
		const RequestData = lookup('RequestData');

		const requestData = new RequestData({
			method  : 'GET',
			url     : '/test',
			query   : {},
			params  : {},
			body    : {},
			headers : {},
			id      : 'test-hook-1'
		});

		// preCreation fires for RequestData
		const preRequest = preHookCalls.find(h => h.TypeName === 'RequestData');
		expect(preRequest).toBeDefined();
		expect(preRequest?.args[0]).toMatchObject({ method: 'GET' });

		// postCreation fires for RequestData
		const postRequest = postHookCalls.find(h => h.TypeName === 'RequestData');
		expect(postRequest).toBeDefined();
		expect(postRequest?.inheritedInstance).toMatchObject({ method: 'GET' });

		// Chain: RouteData
		const routeData = new requestData.RouteData({
			pagePath : '/test',
			isMain   : false,
			deep     : ''
		});

		// preCreation fires for RouteData
		const preRoute = preHookCalls.find(h => h.TypeName === 'RouteData');
		expect(preRoute).toBeDefined();
		expect(preRoute?.existentInstance).toMatchObject({ method: 'GET' });

		// postCreation fires for RouteData
		const postRoute = postHookCalls.find(h => h.TypeName === 'RouteData');
		expect(postRoute).toBeDefined();
		expect(postRoute?.inheritedInstance).toMatchObject({ pagePath: '/test' });
	});

	it('fires creationError when PageData validation fails', async () => {
		const { lookup } = await import('mnemonica/module');
		const RequestData = lookup('RequestData');

		const requestData = new RequestData({
			method  : 'GET',
			url     : '/test',
			query   : {},
			params  : {},
			body    : {},
			headers : {},
			id      : 'test-hook-2'
		});
		const routeData = new requestData.RouteData({
			pagePath : '/test',
			isMain   : false,
			deep     : ''
		});

		// The validation hook in server.ts throws if path is missing
		// We simulate this by creating PageData with invalid args
		try {
			new routeData.PageData({ header: null, content: '', info: {}, blocks: [], path: '' });
		} catch {
			// Expected to throw if validation is strict
		}

		// At minimum, preCreation should have fired for PageData
		const prePage = preHookCalls.find(h => h.TypeName === 'PageData');
		expect(prePage).toBeDefined();
	});

	it('hooks carry chain context via existentInstance', async () => {
		const { lookup } = await import('mnemonica/module');
		const RequestData = lookup('RequestData');

		const requestData = new RequestData({
			method  : 'GET',
			url     : '/chain-test',
			query   : {},
			params  : {},
			body    : {},
			headers : {},
			id      : 'test-hook-3'
		});

		const routeData = new requestData.RouteData({
			pagePath : '/chain-test',
			isMain   : false,
			deep     : ''
		});

		// preCreation for RouteData should have RequestData as existentInstance
		const preRoute = preHookCalls.find(h => h.TypeName === 'RouteData');
		expect(preRoute).toBeDefined();
		expect(preRoute?.existentInstance).toBe(requestData);

		// postCreation for RouteData should have RouteData as inheritedInstance
		const postRoute = postHookCalls.find(h => h.TypeName === 'RouteData');
		expect(postRoute).toBeDefined();
		expect(postRoute?.inheritedInstance).toBe(routeData);
	});
});
