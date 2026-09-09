# finecut-fastify-otel

FineCut CMS backend — Fastify 5 + mnemonica page engine, observed with
**[@mnemonica/otel](https://www.npmjs.com/package/@mnemonica/otel)** +
**[@mnemonica/dive](https://www.npmjs.com/package/@mnemonica/dive)**.

This is the same app as [`../fastify`](../fastify) with the observability
layer swapped: the raw OTel `NodeSDK` + auto-instrumentations are gone;
the explicit mnemonica stack is in. Routes, services, templates, and the
existing tests are untouched.

## What the swap gives you

One HTTP request produces ONE coherent trace:

```
HTTP GET /                      ← request span (runInRequestScope)
├─ mnemonica.RequestData        ┐ construction spans (two vocabularies:
├─ dive.create:RequestData      │ mnemonica.* + dive.create:*)
├─ dive.call:loadPage           │ wrapped sync-splits, named after the
├─ …                            │ wrapping function expression
└─ mnemonica.caught-exception   ┘ Unblinder, on failure only
```

Every span of a request is parented directly on the request span
(construction spans close at postCreation, so the sequential chain is a
row of siblings — verified).

## Where the wiring lives

| File | What it shows |
|---|---|
| `src/tracing.ts` | `NodeTracerProvider` + provider trio + `attachObservability` + Unblinder process reporting (imported first in `server.ts`) |
| `src/core/server.ts` | `attachObservability(defaultTypes)`; the `onRequest` hook (`feedPreRootFromRequest(request)` + `runInRequestScope`); the `setErrorHandler` Unblinder boundary; the wrapped static-cache detach point |
| `src/routes/frontend.ts` | call-site wraps of the sync-splits with chain instances; Unblinder in the route catch |
| `src/routes/engine/api.ts`, `src/routes/engine/tree_pages.ts` | engine-action wraps with the `EngineRequest` instance |

Fastify-specific notes (verified):

- The hook feeds the Fastify `request` to `feedPreRootFromRequest` (it
  reads `.method/.url/.params/.query/.body/.headers`), but
  `runInRequestScope` gets a structural `{ method, url }` plus
  `reply.raw` — `IncomingMessage.method` is typed `string | undefined`
  and does not satisfy `HttpRequestLike` directly.
- The old `utils.exception as unknown as new (...)…` cast in the
  frontend catch is gone — `Reflect.construct(utils.exception,
  [chainInstance, error])` does the same with zero casts.

## Run

```bash
npm install
npm run build
docker compose -f ../docker-compose.yml up -d   # Jaeger on :16686
npm start
```

Hit a few routes, open <http://localhost:16686>, pick service
`finecut-fastify-otel`.

## Tests

```bash
npm test
```

`test/integration/observability.test.ts` proves the wiring against an
in-memory exporter (no Jaeger needed): span names, single-trace
parentage, and the Unblinder span carrying the dive branch.

> **Determinism note:** the app's static cache (`settings.static`) points
> at the SHARED sibling dir `../bff/data/static`. A cache hit skips the
> render/component spans, so the test clears the cached `_index` first.
