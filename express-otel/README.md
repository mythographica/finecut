# finecut-express-otel

FineCut CMS backend — Express 5 + mnemonica page engine, observed with
**[@mnemonica/otel](https://www.npmjs.com/package/@mnemonica/otel)** +
**[@mnemonica/dive](https://www.npmjs.com/package/@mnemonica/dive)**.

This is the same app as [`../express`](../express) with the observability
layer swapped: the raw OTel `NodeSDK` + auto-instrumentations are gone;
the explicit mnemonica stack is in. Everything else — routes, services,
templates, tests — is untouched.

## What the swap gives you

One HTTP request produces ONE coherent trace:

```
HTTP GET /                      ← request span (runInEntryScope)
├─ dive.create:RequestData      ┐
├─ mnemonica.RequestData        │ construction spans close at
├─ dive.create:RouteData        │ postCreation, so the sequential
├─ mnemonica.RouteData          │ chain in the route handler is a
├─ dive.call:loadPage           │ row of SIBLINGS under the
├─ …                            │ request span — every span's
└─ mnemonica.caught-exception   ┘ parent is the request span
```

- **Constructions are spans.** `MnemonicaOtelProvider` emits
  `mnemonica.<TypeName>`; `DiveOtelProvider` emits `dive.create:<TypeName>`
  — two vocabularies over the same lifecycle, both wired in
  `src/tracing.ts` (`attachObservability`).
- **Service calls are spans.** The sync-splits (page load, cache check,
  component resolution, template render, engine actions) are wrapped at
  the call site WITH the chain instance they serve:
  ```typescript
  const pageFiles = await wrap(function loadPage () {
  	return loadPageFiles(fullPagePath);
  }, routeData)();
  ```
  The wrapper is a **named function expression** — its name becomes the
  edge caption and the span name (`dive.call:loadPage`). Never wrap the
  imported function itself: its typed signature violates dive's
  `(...args: unknown[])` constraint, and an anonymous closure would
  caption as a bare callsite.
- **Errors arrive with their data.** The route catch, the Express error
  middleware, and the process-level handlers all report through the
  Unblinder: `analyseError(captureError(err))` recovers the dive branch, the
  errored construction and the attempted args from the error OBJECT;
  the app's `unblind`/`reportProcessError` helpers (`src/tracing.ts`)
  record the analysis as a `mnemonica.error` span event (a fresh ERROR
  `mnemonica.caught-exception` span when no request span is active) plus
  the `[unblind]` stdout marker.
- **Async hops are attributed.** Timers, promise continuations and other
  unwrapped async work land under the parental dive edge via the
  `AsyncFlowProvider` ALS backbone — no per-callback wrapping needed
  (fire-and-forget promises that OUTLIVE their construction frame are
  still wrapped explicitly — see the static-cache hook in
  `src/core/server.ts`).

## Run

```bash
npm install
npm run build
docker compose -f ../docker-compose.yml up -d   # Jaeger on :16686
npm start
```

Hit a few routes, open <http://localhost:16686>, pick service
`finecut-express-otel`.

## Tests

```bash
npm test
```

`test/integration/observability.test.ts` proves the wiring against an
in-memory exporter (no Jaeger needed): span names, single-trace
parenting, and the Unblinder span carrying the dive branch.

## Files that carry the wiring

| File | What it shows |
|---|---|
| `src/tracing.ts` | tracer provider + the provider trio + `attachObservability` + Unblinder process reporting |
| `src/core/server.ts` | `attachObservability(defaultTypes)`, the request-scope middleware, the error middleware, the wrapped static-cache detach point |
| `src/routes/frontend.ts` | call-site wraps of the sync-splits with chain instances; Unblinder in the route catch |
| `src/routes/engine/api.ts`, `src/routes/engine/tree_pages.ts` | engine-action wraps with the `EngineRequest` instance |
