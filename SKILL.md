# SKILL.md — Instrumenting an app with the mnemonica observability stack

How to wire a Node.js HTTP app onto `mnemonica` + `@mnemonica/dive` +
`@mnemonica/otel` so one request produces one coherent trace, and crashes
arrive with their data. Distilled from crafting `finecut/{express,fastify,nest}-otel`
against the live stack — every claim below was verified by running it.

Read first, and never duplicate:
- [`@mnemonica/dive` SKILL.md](../dive/SKILL.md) — where wraps must be
  placed (entry points, detach points), the context rule.
- [`@mnemonica/otel` README](../otel/README.md) — the export table and
  the wiring contract.

## Known-good versions (probed 2026-09-09)

| Package | Version | Note |
|---|---|---|
| `mnemonica` | `^1.3.0` | core |
| `@mnemonica/dive` | `^0.8.7` | `wrap`, `current`, `getErrorInstance`, `getFlow` stable |
| `@mnemonica/otel` | `^0.1.0` | the framework-free engine |
| `@mnemonica/nestjs` | `^0.8.1` | NestJS adapter; re-exports the otel surface |
| `@mnemonica/tactica` | **`0.1.9`** | ⚠ 0.3.0 widens object-typed instance fields to `unknown` and breaks app-level `Pick`s of generated types. Pin 0.1.9 until that is resolved, or narrow at runtime (never cast). |

## The five moves

### 1. One bootstrap module, imported FIRST

`src/tracing.ts` (kept under the old name so entry files don't move):

- `NodeTracerProvider` + `SimpleSpanProcessor` + `OTLPTraceExporter`
  (`http://localhost:4318/v1/traces` for the local Jaeger), then
  `provider.register()`.
- Do **not** add HTTP auto-instrumentations: the request span is created
  explicitly by `runInRequestScope` — auto-instrumentation would double it.
- Export the provider trio as singletons: `otel = new MnemonicaOtelProvider(tracer)`,
  `diveOtel = new DiveOtelProvider(tracer)`, `asyncFlow = new AsyncFlowProvider()`.
- Export `attachObservability(collection)`:
  `attachHooks(collection)` → `otel.attachHooks(collection)` →
  `diveOtel.attach()` → `asyncFlow.attach()`. **Exactly once per process**
  (dive's `clear()` wipes subscribers — re-attach after calling it).
- Export `reportProcessError(err, kind)` implemented with the Unblinder
  (`buildUnblindReport` + `recordUnblindTelemetry`) and
  `flushTracing()` = `tracerProvider.shutdown()`.

### 2. Attach the collection once, at startup

`attachObservability(defaultTypes)` right after the app's own
`registerHook` calls. From then on every construction is a `create` edge,
every instance method is auto-wrapped, and constructor function-arguments
are context-carried — zero userland code.

### 3. Request scope at the framework boundary

One span per request + the triple scope (provider ALS + OTel global
context + async-flow root frame):

- **Express**: middleware after body parsing —
  `feedPreRootFromRequest(req); runInRequestScope(req, res, { tracer, otel, asyncFlow }, () => next());`
- **Fastify**: `onRequest` hook — feed the Fastify `request` to
  `feedPreRootFromRequest` (it reads `.method/.url/.params/.query/.body/.headers`),
  but scope a STRUCTURAL minimum plus the raw reply:
  `runInRequestScope({ method: request.method, url: request.url }, reply.raw, deps, () => done())`.
  Verified: `request.raw.method` is typed `string | undefined` and does
  not satisfy `HttpRequestLike` — build the `{method, url}` object, no cast.
- **NestJS (platform-fastify)**: a `NestMiddleware` applied
  `forRoutes('*')`. Verified: middie hands middleware the RAW
  `IncomingMessage`/`ServerResponse`, so pass them straight through like
  Express.

### 4. Error boundaries — every layer, all Unblinder

- **Route-level catch**: `buildUnblindReport(err)` +
  `recordUnblindTelemetry(report, err)` before rendering the 500.
- **Framework error handler**: Express error middleware /
  Fastify `setErrorHandler` / Nest global `@Catch()` filter (registered via
  `APP_FILTER` from `@nestjs/core`). Verified Nest shape: the reply object
  is `ServerResponse` *or* `FastifyReply` depending on phase — narrow with
  `instanceof ServerResponse`, write through the raw response.
- **Process handlers** (`uncaughtException` / `unhandledRejection`):
  `reportProcessError(err, kind)` → flush → exit. This is the boundary
  where dive pays for itself: the branch, the errored construction and the
  attempted args are recovered from the error OBJECT — no ALS survives
  here, the pin does.

The pinned contract (downstream greps depend on it): span name
`mnemonica.caught-exception`, `report.kind === 'caught-unblinded'`,
stdout marker `[unblind]`.

### 5. Wrap the sync-splits — with the grammar that actually works

Wrap the free service functions at the CALL SITE, with the chain instance
the work serves:

```typescript
const pageFiles = await wrap(function loadPage () {
	return loadPageFiles(fullPagePath);
}, routeData)();
```

Rules learned the hard way:

- **Wrap a named function expression, never the imported function.**
  dive's signature is `wrap<T extends (...args: unknown[]) => unknown>`;
  under `strictFunctionTypes` a typed `(leaf: string) => Promise<X>` does
  not satisfy it. A zero-arg closure returning the call preserves types
  with no cast.
- **The wrapper's own NAME becomes the caption and the span name**
  (`dive.call:loadPage`). The `label` argument is IGNORED for anonymous
  functions (caption falls back to the callsite path:line:col) — labels
  only prefix when the wrapped function already has a name
  (`label:name`). Name the wrapper after the action, skip the label.
- **Name-shadowing trap**: if the wrapper is named like the import, its
  body resolves the name to itself → infinite recursion. Name it
  differently (`loadPage` wrapping `loadPageFiles`) or alias the import.
- **Context = the instance.** A contextless wrap records a lonely,
  unstitched edge (dive SKILL.md's context rule). Open an `EngineRequest`
  (or use the chain instance) so the branch exists.
- **Detach points stay manual**: fire-and-forget promises that outlive
  their construction frame (e.g. a static-cache write in a postCreation
  hook) get wrapped with their instance; their `.catch` rides along.
- Inner I/O helpers (file reads etc.) are NOT wrapped — the
  `AsyncFlowProvider` attributes unwrapped async hops to the parental
  edge. Wrap the top of each unit of work, not every function.
- **`utils.exception` needs no cast.** Where old code did
  `utils.exception as unknown as new (...)…`, use
  `Reflect.construct(utils.exception, [chainInstance, error])` — zero
  casts, same enriched error.

## Verified trace semantics (Jaeger / exporter reality)

- Span names: `HTTP {METHOD} {url}` (request), `mnemonica.{TypeName}`
  (MnemonicaOtelProvider), `dive.create:{TypeName}` and
  `dive.call:{Name}` (DiveOtelProvider), `mnemonica.caught-exception`
  (Unblinder). Constructions appear TWICE — one span per provider
  vocabulary; that is by design.
- **Sequential construction chains are SIBLINGS, not nested.** A
  construction span closes at postCreation, so the next
  `new instance.SubType()` in the route handler finds the request span in
  the ALS, not the finished parent-construction span. Verified shape:
  every span of the request parented directly on the `HTTP …` span.
  Lineage nesting appears only when a subtype is constructed INSIDE its
  parent's active construction window.
- Cache-hit paths skip the work: if a static cache answers the request,
  the render/component `dive.call:*` spans never emit. Tests must assert
  the intersection of cache-hit and cache-miss paths. **FineCut caveat:**
  `settings.static` points at the SHARED sibling `../bff/data/static` —
  test suites delete/seed that dir, which (a) makes span counts
  nondeterministic unless the test clears the cached `_index` in
  `beforeAll`, and (b) mutates the bff repo's working tree as a side
  effect (regenerable caches, but `git status` there will show it).
- Test-side span reads: sdk-trace-base 2.x exposes
  `ReadableSpan.parentSpanContext?.spanId` — use the SDK's own
  `ReadableSpan` type instead of hand-rolled shapes with casts.

## Test recipe (no Jaeger needed)

- `NodeTracerProvider` + `SimpleSpanProcessor` + `InMemorySpanExporter`,
  `provider.register()` in `beforeAll` **before** importing anything that
  grabs a tracer. OTel's global `register()` is once-per-process and a
  no-op afterwards — vitest isolates test FILES into separate processes,
  so each observability test file owns its provider.
- Build the app in the test the same way the entry file does (same
  middleware order, same attach sequence) — never import the entry file.
- Assert: span NAMES (the contract), and parentage — every finished span
  except the HTTP request span is parented on the request span's id.
- Unblind test: `wrap(function failingStep () { throw new Error(...); }, ctx)`
  in try/catch → `getErrorInstance(thrown) === ctx`, then
  `buildUnblindReport` + `recordUnblindTelemetry` → assert the
  `mnemonica.caught-exception` span carries `dive.branch` containing
  `failingStep`.

## Environment gotchas (probed on this machine)

- **npm 10.9.8 arborist crash** (`Cannot read properties of null
  (reading 'edgesOut')`) on fresh installs resolving vitest's peer set.
  Workaround: seed the new app's `package-lock.json` from a sibling that
  has one (patch the two `name` fields), then `npm install` resolves only
  the delta and never rebuilds the poisoned peer subtree.
- When copying an app dir: exclude `node_modules`, `build`, logs, cache
  dirs — and drop the copied `.git` (the copy must not push to the
  source's remote).
