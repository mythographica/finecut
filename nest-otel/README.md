# finecut-nest-otel

FineCut CMS — NestJS pilot, observed with the explicit mnemonica stack:
`mnemonica` + `@mnemonica/dive` + `@mnemonica/otel`, with
`@mnemonica/nestjs` present only for its module (`autoExtract`
serializer). This is [`../nest`](../nest) re-wired — the "what does
mnemonica/core + dive + otel buy a plain NestJS app" answer, WITHOUT the
heavy adapter machinery (no `mti`/`mvp`, no thunderstruck interceptors —
for that story see [`../nest-dive`](../nest-dive)).

## What the swap gives you

Same trace shape as the other `-otel` demos — one request, one trace:

```
HTTP GET /                      ← request span (runInRequestScope)
├─ mnemonica.RequestData        ┐ construction spans (provider trio)
├─ dive.create:RouteData        │
├─ dive.call:loadPage           │ wrapped sync-splits, named after
├─ …                            │ the wrapping function expression
└─ mnemonica.caught-exception   ┘ Unblinder, on failure only
```

Every span of a request is parented directly on the request span
(construction spans close at postCreation, so the sequential chain is a
row of siblings — verified).

## Where the wiring lives

| File | What it shows |
|---|---|
| `src/tracing.ts` | `NodeTracerProvider` + provider trio + `attachObservability` + Unblinder process reporting (imported first in `main.ts`) |
| `src/request-scope.middleware.ts` | global `NestMiddleware`: `feedPreRootFromRequest` + `runInRequestScope` — middie hands over the RAW `IncomingMessage`/`ServerResponse`, so it reads like the Express recipe |
| `src/unblind-exception.filter.ts` | global `@Catch()` filter (registered via `APP_FILTER`): `buildUnblindReport` + `recordUnblindTelemetry`, then 500 with the report body |
| `src/app.module.ts` | `attachObservability(defaultTypes)` after the app's own hooks; middleware via `configure(consumer)` |
| `src/frontend/frontend.controller.ts`, `src/engine/engine.controller.ts` | call-site wraps of the sync-splits with the chain instance (`wrap(function loadPage () { … }, routeData)()`), Unblinder in the route catch |

## Run

```bash
npm install
npm run build
docker compose -f ../docker-compose.yml up -d   # Jaeger on :16686
npm start
```

Hit a few routes, open <http://localhost:16686>, pick service
`finecut-nest-otel`.

## Tests

```bash
npm test        # builds first is NOT automatic: npm run build && npx vitest run
```

`test/observability.e2e.spec.ts` registers an `InMemorySpanExporter`
before importing the compiled `AppModule` and proves: span names, the
single-trace parentage, and behavior on both static-cache paths (a cache
hit skips the render/component spans — asserted intersection only).
