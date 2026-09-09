/**
 * EngineController — Admin API routes.
 *
 * Mirrors finecutnode/src/routes/engine/*.ts
 * Uses mnemonica chains for admin operations.
 */
import {
	Controller, Get, Post, Query, Body, Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { lookup, getProps, utils } from 'mnemonica/module';
import { current, getErrorInstance, wrap } from '@mnemonica/dive';
import '../core/engine-types.js';
import { EngineService } from './engine.service.js';

const EngineRequest = lookup('EngineRequest');

@Controller('engine')
export class EngineController {
	constructor (private readonly engineService: EngineService) {}

	// Settings
	@Get('settings')
	async getSettings () {
		return this.engineService.loadSettings();
	}

	@Post('settings')
	async postSettings (@Body() body: Record<string, unknown>) {
		const engineRequest = new EngineRequest({ body });
		const data = engineRequest.data as Record<string, unknown> | undefined;
		if (!data) {
			return { error: 'Missing data field' };
		}
		return this.engineService.saveSettings(data);
	}

	// Tree
	@Get('tree')
	async getTree (@Query('leaf') leaf = '') {
		const tree = await this.engineService.getPageTree(leaf);
		const engineRequest = new EngineRequest({
			body: { action: 'get', leaf },
		});
		const treeResult = new engineRequest.TreeResult({ tree });
		return treeResult.tree;
	}

	@Post('tree')
	async postTree (@Body() body: Record<string, unknown>, @Res() res: FastifyReply) {
		const action = String(body.action || '');
		const leaf = String(body.leaf || '');
		const pageName = String(body.path || '');
		let rawData = body.data;
		if (typeof rawData === 'string') {
			try { rawData = JSON.parse(rawData) as Record<string, unknown>; }
			catch { /* leave as-is */ }
		}
		const data = (typeof rawData === 'object' && rawData !== null)
			? rawData as Record<string, unknown>
			: undefined;

		const engineRequest = new EngineRequest({ body });

		if (action === 'get') {
			const tree = await this.engineService.getPageTree(leaf);
			const treeResult = new engineRequest.TreeResult({ tree });
			return res.type('application/json').send(treeResult.tree);
		}

		if (action === 'set') {
			try {
				const result = await this.engineService.handleSet(leaf, pageName, data);
				return res.type('application/json').send(result);
			} catch {
				return res.status(409).type('application/json').send({ error: 'Page already exists' });
			}
		}

		if (action === 'mkdir') {
			const result = await this.engineService.handleMkdir(leaf, pageName);
			return res.type('application/json').send(result);
		}

		if (action === 'del') {
			const result = await this.engineService.handleDel(leaf, pageName);
			return res.type('application/json').send(result);
		}

		if (action === 'content_get') {
			try {
				const result = await this.engineService.handleContentGet(leaf);
				return res.type('application/json').send(result);
			} catch {
				return res.status(404).type('application/json').send({ error: 'Page not found' });
			}
		}

		if (action === 'content_set') {
			if (!data) {
				return res.status(400).type('application/json').send({ error: 'Missing data' });
			}
			const result = await this.engineService.handleContentSet(leaf, data);
			return res.type('application/json').send(result);
		}

		return res.status(400).type('application/json').send({ error: 'Unknown action' });
	}

	// Page (GET shortcut)
	@Get('page')
	async getPage (@Query('leaf') leaf = '', @Res() res: FastifyReply) {
		try {
			const result = await this.engineService.handleContentGet(leaf);
			return res.type('application/json').send(result);
		} catch {
			return res.status(404).type('application/json').send({ error: 'Page not found' });
		}
	}

	// Template list
	@Get('template')
	async getTemplates () {
		return this.engineService.getTemplates();
	}

	// Template actions
	@Get('template-action')
	async getTemplateAction (
		@Query('action') action: string,
		@Query('template') template: string,
		@Res() res: FastifyReply,
	) {
		if (!template) {
			return res.status(400).type('application/json').send({ error: 'Missing template name' });
		}

		if (action === 'get') {
			const data = await this.engineService.readTemplate(template);
			if (!data) {
				return res.status(404).type('application/json').send({ error: 'Template not found' });
			}
			const engineRequest = new EngineRequest({
				body: { action, template },
			});
			const templateResult = new engineRequest.TemplateResult(data);
			return res.type('application/json').send(templateResult.template);
		}

		if (action === 'getInfo') {
			const data = await this.engineService.readTemplate(template);
			if (!data) {
				return res.status(404).type('application/json').send({ error: 'Template not found' });
			}
			const engineRequest = new EngineRequest({
				body: { action, template },
			});
			const templateResult = new engineRequest.TemplateResult({
				snippet: data.snippet,
				header: data.header,
			});
			return res.type('application/json').send(templateResult.template);
		}

		return res.status(400).type('application/json').send({ error: 'Unknown action' });
	}

	@Post('template-action')
	async postTemplateAction (
		@Body() body: Record<string, unknown>,
		@Res() res: FastifyReply,
	) {
		const action = String(body.action || '');
		const template = String(body.template || '');
		const source = String(body.source || '');
		const snippet = String(body.snippet || '');
		const header = String(body.header || '');

		if (!template) {
			return res.status(400).type('application/json').send({ error: 'Missing template name' });
		}

		if (action === 'get') {
			const data = await this.engineService.readTemplate(template);
			if (!data) {
				return res.type('application/json').send({ source: '', snippet: '', header: '' });
			}
			const engineRequest = new EngineRequest({
				body: { action, template },
			});
			const templateResult = new engineRequest.TemplateResult(data);
			return res.type('application/json').send(templateResult.template);
		}

		if (action === 'getInfo') {
			const data = await this.engineService.readTemplate(template);
			if (!data) {
				return res.type('application/json').send({ snippet: '', header: '' });
			}
			const engineRequest = new EngineRequest({
				body: { action, template },
			});
			const templateResult = new engineRequest.TemplateResult({
				snippet: data.snippet,
				header: data.header,
			});
			return res.type('application/json').send(templateResult.template);
		}

		if (action === 'add') {
			const ok = await this.engineService.addTemplate(template, source, snippet, header);
			if (!ok) {
				return res.status(409).type('application/json').send({ error: 'Template already exists' });
			}
			return res.type('application/json').send({ success: true });
		}

		if (action === 'save') {
			const ok = await this.engineService.saveTemplate(template, source, snippet, header);
			if (!ok) {
				return res.status(404).type('application/json').send({ error: 'Template not found' });
			}
			return res.type('application/json').send({ success: true });
		}

		if (action === 'del') {
			const ok = await this.engineService.deleteTemplate(template);
			return res.type('application/json').send({ success: ok });
		}

		return res.status(400).type('application/json').send({ error: 'Unknown action' });
	}

	// API
	@Post('api')
	async postApi (@Body() body: Record<string, unknown>, @Res() res: FastifyReply) {
		const action = String(body.action || '');
		const leaf = String(body.leaf || '');
		const pathName = String(body.path || '');
		let rawData = body.data;
		if (typeof rawData === 'string') {
			try { rawData = JSON.parse(rawData) as Record<string, unknown>; }
			catch { /* leave as-is */ }
		}
		const data = (typeof rawData === 'object' && rawData !== null)
			? rawData as Record<string, unknown>
			: undefined;

		const engineRequest = new EngineRequest({ body });

		if (action === 'clear_cache') {
			const ok = await this.engineService.clearCache();
			const cacheResult = new engineRequest.CacheResult(ok);
			return res.type('application/json').send({ cleared: cacheResult.cleared });
		}

		if (action === 'content_get') {
			try {
				const result = await this.engineService.handleContentGet(leaf);
				return res.type('application/json').send(result);
			} catch {
				return res.status(404).type('application/json').send({ error: 'Page not found' });
			}
		}

		if (action === 'content_set') {
			if (!data) {
				return res.status(400).type('application/json').send({ error: 'Missing data' });
			}
			const result = await this.engineService.handleContentSet(leaf, data);
			return res.type('application/json').send(result);
		}

		if (action === 'set') {
			try {
				const result = await this.engineService.handleSet(leaf, pathName, data);
				return res.type('application/json').send(result);
			} catch {
				return res.status(409).type('application/json').send({ error: 'Page already exists' });
			}
		}

		if (action === 'settings_path') {
			return res.type('text/plain').send(this.engineService.getPagesPath());
		}

		if (action === 'settings') {
			const dataVal = String(body.data || '');
			return res.type('text/plain').send(await this.engineService.handleSettings(dataVal));
		}

		if (action === 'mkdir') {
			const result = await this.engineService.handleMkdir(leaf, pathName);
			return res.type('application/json').send(result);
		}

		if (action === 'del') {
			const result = await this.engineService.handleDel(leaf, pathName);
			return res.type('application/json').send(result);
		}

		return res.status(400).type('application/json').send({ error: 'Unknown action' });
	}

	// Health
	@Get('health')
	health () {
		return { status: 'ok', mnemonica: true };
	}

	// ─────────────────────────────────────────────────────────────
	// Dive test routes
	// ─────────────────────────────────────────────────────────────

	/** Basic context shifting: current() follows the newest instance */
	@Get('dive-context')
	diveContext () {
		const engineRequest = new EngineRequest({ body: { action: 'test' } });
		const treeResult = new engineRequest.TreeResult({ tree: [] });

		const last = current();
		const isTreeResult = last === treeResult;
		const typeName = last
			? ((last as unknown as Record<symbol, unknown>)[Symbol.for('mnemonica.type')] as { TypeName?: string } | undefined)?.TypeName
			: null;

		return {
			lastContextExists : last !== undefined,
			isTreeResult,
			contextType       : typeName,
		};
	}

	/** Wrapped methods restore instance context and propagate through callbacks */
	@Get('dive-callback')
	diveCallback () {
		const engineRequest = new EngineRequest({ body: { action: 'test' } });
		const treeResult = new engineRequest.TreeResult({ tree: [] });

		// Inject a method onto the prototype after creation, wrapped with the
		// instance as context (attachHooks wrapping already ran at construction).
		Object.getPrototypeOf(treeResult).invokeCallback = wrap(function (
			this: object,
			...args: unknown[]
		) {
			const cb = args[0] as () => object | undefined;
			const result = cb();
			return result;
		}, treeResult);

		// Callback should execute with treeResult as active context
		const cbResult = ((treeResult as Record<string, unknown>).invokeCallback as (
			cb: () => object | undefined
		) => object | undefined)(
			() => current()
		);

		return {
			callbackContextIsTreeResult : cbResult === treeResult,
		};
	}

	/** Synchronous error pinned to its dive context (caught by NestJS) */
	@Get('dive-error')
	diveError () {
		const engineRequest = new EngineRequest({ body: { action: 'test' } });
		const treeResult = new engineRequest.TreeResult({ tree: [] });

		// Inject throw method, wrapped so the error self-pins treeResult
		Object.getPrototypeOf(treeResult).failSync = wrap(function () {
			throw new Error('dive-sync-error');
		}, treeResult);

		try {
			((treeResult as Record<string, unknown>).failSync as () => void)();
			return { errorEnriched: false, message: 'should have thrown' };
		} catch (err) {
			const instance = getErrorInstance(err as Error);
			return {
				errorEnriched : instance === treeResult,
				message       : (err as Error).message,
			};
		}
	}

	/**
	 * Uncaught exception via setImmediate — escapes NestJS catch boundary.
	 * The error is created via utils.exception() (mnemonica enriched error).
	 * process.on('uncaughtException') logs dive context from the error.
	 */
	@Get('dive-uncaught')
	diveUncaught () {
		const engineRequest = new EngineRequest({ body: { action: 'test' } });
		const treeResult = new engineRequest.TreeResult({
			tree: [{ name: 'uncaught-test', folder: false }],
		});

		// mnemonica no longer binds .exception onto instances. utils.exception is
		// typed as a plain function but MUST be called with `new` at runtime.
		const ExceptionCtor = utils.exception as unknown as
			new (instance: object, e: Error) => Error;

		// Schedule throw outside NestJS controller boundary.
		// wrap() carries treeResult as context into setImmediate, and the throw
		// self-pins the instance as it crosses the wrap() edge.
		const throwUncaught = wrap(() => {
			const enriched = new ExceptionCtor(treeResult, new Error('dive-uncaught-exception'));
			throw enriched;
		}, treeResult);
		setImmediate(throwUncaught);

		const last = current();
		const lastProps = last ? (() => {
			try {
				return getProps(last);
			} catch {
				return undefined;
			}
		})() : undefined;

		return {
			scheduled               : true,
			lastContextBeforeReturn : lastProps?.__type__?.TypeName ?? 'none',
		};
	}

	/**
	 * Deep context propagation through async callback chains.
	 *
	 * Scenario:
	 *   1. Nest receives DTO → creates mnemonica entity (TreeResult)
	 *   2. Calls dive-wrapped method that accepts a callback
	 *   3. Callback chains through 10 setTimeout ticks
	 *   4. Tick 10: plain function (NOT mnemonica) throws ReferenceError
	 *   5. Dive context links the failure back to the original TreeResult
	 *
	 * This proves dive wraps *live execution context*, not just mnemonica methods.
	 * Any callback passed through a dive-wrapped boundary carries the instance context.
	 */
	@Get('dive-deep-context')
	async diveDeepContext () {
		const engineRequest = new EngineRequest({ body: { action: 'deep-test', payload: 'dto-data' } });
		const treeResult = new engineRequest.TreeResult({
			tree: [{ name: 'deep-test-node', folder: false }],
		});

		// Add a method that receives a callback and invokes it, wrapped with
		// treeResult as context (attachHooks wrapping already ran at construction).
		Object.getPrototypeOf(treeResult).runTask = wrap(function (
			this: object,
			...args: unknown[]
		) {
			const task = args[0] as (instance: object) => void;
			task(this);
		}, treeResult);

		const report = await new Promise<{
			ticks: number;
			contextPreserved: boolean;
			contextType: string | null;
			errorType: string;
			errorMessage: string;
		}>((resolve, reject) => {
			// Pass callback to dive-wrapped method.
			// wrapArgs wraps it with treeResult context.
			((treeResult as Record<string, unknown>).runTask as (task: (inst: object) => void) => void)(
				(_instance: object) => {
					let tick = 0;

					// Recursive tick function — each invocation wrapped by dive
					const nextTick = () => {
						tick++;

						if (tick < 10) {
							// Chain to next tick — wrap preserves treeResult context
							setTimeout(wrap(nextTick), 5);
							return;
						}

						// Tick 10: plain function, NOT a mnemonica instance method.
						// But it was wrapped by dive while treeResult was active context.
						const plainFailingFn = wrap(() => {
							const ctx = current();
							const ctxType = ctx
								? (() => {
									try {
										return getProps(ctx)?.__type__?.TypeName ?? 'unknown';
									} catch {
										return 'unknown';
									}
								})()
								: 'none';

							// ReferenceError: accessing property of undefined
							const obj: Record<string, unknown> | undefined = undefined;
							// eslint-disable-next-line @typescript-eslint/no-unused-expressions
							obj!.crash;
						});

						try {
							plainFailingFn();
						} catch (err) {
							const diveCtx = current();
							const diveType = diveCtx
								? (() => {
									try {
										return getProps(diveCtx)?.__type__?.TypeName ?? 'unknown';
									} catch {
										return 'unknown';
									}
								})()
								: 'none';

							resolve({
								ticks           : tick,
								contextPreserved: diveCtx === treeResult,
								contextType     : diveType,
								errorType       : (err as Error).constructor.name,
								errorMessage    : (err as Error).message,
							});
						}
					};

					// Kick off the chain
					setTimeout(wrap(nextTick), 5);
				}
			);
		});

		return report;
	}

	/**
	 * End-to-end dive context propagation through real-world async boundaries.
	 *
	 * Flow:
	 *   1. Nest receives request → creates DiveTestEntity (mnemonica instance)
	 *   2. Dive postCreation hook auto-wraps instance methods
	 *   3. instance.process() calls worker.doWork() — context preserved
	 *   4. Worker runs for/await loop with 5 setTimeout steps
	 *   5. Step 3 pushes instance to global queue (with dive-wrapped runner)
	 *   6. Queue consumer (setInterval) executes runner → context restored
	 *   7. Validator checks instance.value (string instead of number) → throws
	 *   8. Error escapes to uncaughtException handler
	 *   9. Handler uses getErrorInstance(err) to retrieve the exact instance
	 */
	@Get('dive-e2e')
	async diveE2E () {
		const { DiveTestEntity } = await import('../lib/dive-test/types.js');

		const uuid = Math.random().toString(36).slice(2);
		const instance = new DiveTestEntity({
			uuid,
			value: 'not-a-number' // deliberately invalid — validator expects 1-10
		});

		// Fire-and-forget the async chain.
		// The error will surface via uncaughtException, not this promise.
		instance.process().catch(() => {
			// Intentionally ignored — error is designed to escape.
		});

		return {
			uuid,
			scheduled : true,
			note      : 'check server.log for uncaughtException dive report'
		};
	}

	/**
	 * Dive stress test: 100 instances, random shuffle, async queue with failures.
	 *
	 * Demonstrates that dive context survives across:
	 *   - random async scheduling
	 *   - multiple instance creations per request
	 *   - setTimeout / setInterval boundaries
	 *   - uncaughtException and unhandledRejection
	 *
	 * ALS would lose all context (different async resources).
	 * Dive preserves instance-linked context through wrapped callbacks.
	 */
	@Get('dive-stress')
	async diveStress () {
		const { StressEntity } = await import('../lib/dive-stress/types.js');
		const { registerInstances } = await import('../lib/dive-stress/registry.js');
		const { startConsumer } = await import('../lib/dive-stress/queue.js');

		const requestId = Math.random().toString(36).slice(2, 12);

		// Create 100 instances. Each creation records a trace edge via dive's
		// postCreation hook; queue failures self-pin their instance through
		// wrap() boundaries — no manual linking needed (dive 0.2).
		const instances : object[] = [];
		for (let i = 0; i < 100; i++) {
			const uuid = `${requestId}-${i}`;
			const instance = new StressEntity({
				uuid,
				requestId,
				value: Math.random() > 0.5 ? Math.floor(Math.random() * 100) : 'string-value'
			});
			instances.push(instance);
		}

		// Shuffle and register 70% randomly
		const registered = registerInstances(instances, 0.7);

		// Start the random consumer
		startConsumer();

		return {
			requestId,
			created    : instances.length,
			registered,
			note       : 'check server.log for DLQ report over next 10-60s',
			testFlow   : [
				'1. created 100 StressEntity instances',
				'2. shuffled + registered 70% to global registry',
				'3. random consumer picks from registry (80-250ms intervals)',
				'4. ~55% success | ~17% sync throw | ~14% async rejection | ~14% nested construction',
				'5. DLQ collects failures, reports at 12 items'
			]
		};
	}

	/**
	 * Crash-and-retrieve: the headline dive demo.
	 *
	 * Creates a CrashDemoEntity, runs it through named flow steps, then lets
	 * an error ESCAPE to process level (mode=sync → uncaughtException,
	 * mode=async → unhandledRejection). The process survives (pinned errors
	 * don't exit — see app.module.ts), and the failure becomes fully
	 * inspectable: poll /engine/dive-crash-report?uuid=... to retrieve the
	 * exact failed instance, the data it carried, and its flow branch.
	 */
	@Get('dive-crash')
	async diveCrash (
		@Query('mode') mode = 'sync',
		@Query('payload') payload = 'demo-payload',
	) {
		const { CrashDemoEntity } = await import('../lib/dive-demo/types.js');
		const { armCrashCapture } = await import('../lib/dive-demo/report.js');
		armCrashCapture();

		const uuid = `crash-demo-${Math.random().toString(36).slice(2, 10)}`;
		const instance = new CrashDemoEntity({
			uuid,
			payload,
			mode : mode === 'async' ? 'async' : 'sync'
		});

		// The chain itself resolves fine — the crash escapes via setImmediate
		// on purpose, so this catch is just a guard, not the demo path.
		instance.run().catch(() => {});

		return {
			uuid,
			scheduled : true,
			mode      : instance.mode,
			next      : `GET /engine/dive-crash-report?uuid=${uuid}`
		};
	}

	/**
	 * Retrieval endpoint for the crash demo. 404 { ready: false } until the
	 * process-level failure has been captured; then the full report.
	 */
	@Get('dive-crash-report')
	async diveCrashReport (@Query('uuid') uuid: string, @Res() res: FastifyReply) {
		const { readReport } = await import('../lib/dive-demo/report.js');
		const report = readReport(String(uuid || ''));
		if (!report) {
			return res.status(404).type('application/json').send({
				ready : false,
				uuid
			});
		}
		return res.type('application/json').send(report);
	}
}
