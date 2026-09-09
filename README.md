# FineCut — one CMS, many stacks

A file-based CMS (pages in `data/pages/`, templates in `views/`, static
cache, tree admin panel) implemented **seven times** over the same
feature set, plus a BFF and a Jaeger rig. This is the comparison artifact
of the [mnemonica](https://www.npmjs.com/package/mnemonica) ecosystem:
same routes, same services, same mnemonica chains — different
observability wiring, so whatever differs in the traces is the stack, not
the app.

## The comparison matrix

| Capability | plain `express` / `fastify` / `nest` | `express-otel` / `fastify-otel` / `nest-otel` | `nest-dive` |
|---|---|---|---|
| OTel wiring | raw `NodeSDK` + auto-instrumentations | `@mnemonica/otel` explicit stack | adapter (`@mnemonica/nestjs`) wires it |
| HTTP span per request | yes (auto) | yes (`runInRequestScope`) | yes |
| Construction spans (`mnemonica.*` / `dive.create:*`) | no | yes | yes |
| Service-call spans (`dive.call:*`) | no | yes (`wrap` at sync-splits) | yes |
| Caught request error | enriched 500 | + Unblinder (`mnemonica.caught-exception`, `dive.branch`) | + Unblinder |
| `uncaughtException` / `unhandledRejection` | root span with the stack only — manual boilerplate | Unblinder span: branch + errored construction + attempted args, recovered from the error object | same, **and the process survives dive-pinned crashes** (DLQ + live crash-report endpoint) |
| Queue / 30-seconds-later attribution | no | yes | yes — load-tested by proof scripts |
| The Why (which *data* failed) | gathered, not retrievable | retrievable | retrievable and queryable |

`bff` is the control group: no mnemonica at all.

## Layout

| Dir | What it is |
|---|---|
| `express/` | Express 5 backend — frozen "industry standard" column |
| `fastify/` | Fastify 5 backend — frozen |
| `nest/` | NestJS 10 pilot (`@mnemonica/nestjs` 0.5) — frozen |
| `nest-dive/` | the proof rig: dive + adapter, crash demos, load proofs |
| `express-otel/` | express re-wired on `@mnemonica/otel` + `@mnemonica/dive` |
| `fastify-otel/` | fastify re-wired, same stack |
| `nest-otel/` | nest + dive + otel — no adapter machinery |
| `bff/` | Backend-for-Frontend: static files, admin panel, proxy to any backend |
| `docker-compose.yml` | Jaeger all-in-one |
| `SKILL.md` | the agent/human wiring guide — how the `-otel` apps were crafted |

## Run any of it

Every backend: `npm install && npm run build && npm start`. Tests:
`npm test` (vitest). Common endpoints: `/` (the CMS page chain),
`/engine/tree` (admin API), and a health route.

Default ports — run one backend at a time, or override with `PORT`:

| App | Port |
|---|---|
| `express`, `express-otel` | 3003 |
| `fastify`, `fastify-otel` | 3000 |
| `nest`, `nest-otel` | 3001 |
| `nest-dive` | 3001 (use `PORT=3011 npm start` to run alongside) |
| `bff` | 3002 |

## The observability comparison (Jaeger)

```bash
docker compose up -d        # Jaeger UI on :16686, OTLP on :4318
```

Start any backend, hit a few routes, open <http://localhost:16686> and
pick the service. Each app reports as `finecut-<name>`.

### What each backend does

The frozen apps import a `src/tracing.ts` first: an OTel `NodeSDK` with
auto-instrumentations, spans via OTLP HTTP.

The `-otel` apps register a plain `NodeTracerProvider` and wire the
explicit stack (`attachObservability(collection)`): request span from
`runInRequestScope` at the framework boundary, constructions and wrapped
calls become spans via the provider trio, error boundaries run the
Unblinder. **Diff any `-otel` app against its frozen twin to isolate
what the wiring buys** — the apps are otherwise identical.

### What to look at

- Ordinary page requests: span timing and topology, comparable across
  all services.
- The dive crash endpoints (`/engine/dive-crash` on nest-dive): the HTTP
  span ends when the response is sent; the later `uncaughtException`
  happens on a fresh macrotask, outside every instrumented context.
  OTel context propagation is AsyncLocalStorage-based and does not
  survive fire-and-forget boundaries — **nothing attaches the crash to
  the request that caused it**.
- What each system does with that crash, three stages for the slide:
  1. **Jaeger alone** — the crash is invisible. The request trace looks
     green and finished.
  2. **Jaeger + manual boilerplate** (the frozen apps): process handlers
     open a root error span and `recordException(err)` — Jaeger shows
     the error with `exception.stacktrace`. All it buys is the *stack*.
  3. **dive / the Unblinder** — `getErrorInstance(err)` hands back the
     exact mnemonica instance that failed; `buildUnblindReport` recovers
     the branch, the errored construction and the attempted args from
     the error OBJECT; the `mnemonica.caught-exception` span carries
     `dive.branch`. No instrumentation layer, no collector needed for
     the attribution itself.
- The nest-dive error span additionally carries, as attributes:
  - `mnemonica.chain` — construction steps with arguments, root to leaf;
  - `mnemonica.instance.data` — `utils.extract` of the failed instance;
  - `mnemonica.flow` — the execution branch, each edge with its status;
  - `dive.instance.uuid` / `dive.instance.type` — the cross-reference.
    `curl "http://localhost:3011/engine/dive-crash-report?uuid=<uuid>"`
    returns the same instance live.

### Gathered ≠ retrievable

Q: are the frozen backends just unable to gather the Why at all?

No — they *do* gather it. They build the same mnemonica chains
(`RequestData → RouteData → PageData → RenderData → ResponseData`), so
the per-instance history with all constructor arguments exists in memory
while the process lives. What they lack is the **handle**: no dive
attached, so when a process-level crash fires on a fresh macrotask,
nothing pins the failing instance to the error — there is no way back
from `err` to the data. Gathered ≠ retrievable.

The nuances that matter:

- Within *caught* request errors they already enrich (the frontend catch
  uses `utils.exception`), so per-request they have the Why too. It is
  exactly the `uncaughtException` / `unhandledRejection` boundary where
  they go blind.
- `bff` is the only backend that truly has nothing: no mnemonica at all.

## Per-app runbooks

### Frozen column: `express/`, `fastify/`, `nest/`

What it demonstrates: the industry-standard baseline — mnemonica page
engine (the 5-type chain per request, lifecycle hooks for validation and
static-cache writes) observed only by raw OTel.

```bash
cd express            # or fastify / nest
npm install && npm run build
npm start             # :3003 / :3000 / :3001
curl localhost:3003/  localhost:3003/engine/tree  localhost:3003/health
```

In Jaeger: one `GET /` span per request, framework internals — and
nothing between. Then open the same route on the matching `-otel` twin.

### The `-otel` column: `express-otel/`, `fastify-otel/`, `nest-otel/`

What it demonstrates: the same app on the explicit stack. One request →
one trace: `HTTP GET /` with the construction spans (`mnemonica.*` +
`dive.create:*`) and wrapped service calls (`dive.call:loadPage`,
`dive.call:renderTemplate`, …) as siblings under it. Errors emit the
pinned `mnemonica.caught-exception` span and the `[unblind]` stdout
marker — at the route catch, at the framework error handler, and at the
process handlers.

```bash
cd express-otel       # or fastify-otel / nest-otel
npm install && npm run build
npm start
curl localhost:3003/
```

Each app's own README maps exactly which files carry the wiring. The
wiring recipe itself is [`SKILL.md`](./SKILL.md). Tests include an
observability spec that proves span names and single-trace parenting
against an in-memory exporter — no Jaeger needed: `npm test`.

### The proof rig: `nest-dive/`

What it demonstrates: the full toolchain under hostile conditions —
context pinned to *data*, not async resources, proven under real load
and real process-level crashes.

```bash
cd nest-dive
npm install && npm run build
PORT=3011 npm start
```

Crash endpoints (watch the log and Jaeger):

```bash
curl "localhost:3011/engine/dive-crash?mode=sync&payload=hello-1"
# → { "uuid": "..." }   …seconds later the setImmediate fires and throws
curl "localhost:3011/engine/dive-crash-report?uuid=<uuid>"
# → the exact instance, its data, and the flow branch that produced it
```

The two proofs (they build, spawn their own server, and exit 0/1):

```bash
npm run load:proof    # 200 unique-marker crashes, 50 in flight over real
                      # TCP, zero misattribution; process stays alive
npm run proof:queue   # 140 markers through a random-order, random-delay
                      # queue — attribution recovered from the error alone
```

Also inside: the full-bundle demo (`mti`/`mvp` thunderstruck boundary,
invariant guards, pre-root store) and the typeomatica strict-fields demo
(class-fields gap). See `src/lib/full-bundle/` and the test suite.

### The BFF + the admin panel (the FE piece)

`bff/` is how you *use* the CMS, not just trace it. It serves the static
assets and the tree admin panel, serves pre-generated page HTML from
`data/static/`, and proxies everything dynamic to whichever backend you
point it at — which is how you compare backends from a real UI.

```bash
# terminal 1: a backend, any of them
cd express-otel && npm start                    # :3003
# terminal 2: the BFF
cd bff && npm install && npm start              # :3002
```

Point the BFF at a different backend (default is `:3003`):

```bash
npm run switch:backend -- http://localhost:3299  # then restart the BFF
```

Then drive it like a user:

- <http://localhost:3002/> — the site itself (served from the static
  cache, or rendered by the backend through the proxy on a cache miss);
- <http://localhost:3002/admin/panel/> — the admin panel: page tree,
  content editor, template editor, file manager (elfinder). Creating or
  editing a page fires `POST /engine/tree` / `POST /engine/api` through
  the proxy — on an `-otel` backend each action lands in Jaeger as its
  own traced branch.

Request flow:

```
GET /                  → bff data/static/_index/index.html (or proxy)
GET /public/…          → bff public/
GET /admin/panel/      → bff admin/panel/index.html
POST /engine/…         → proxy → the backend you switched to
```

> Note: the backends' static-cache setting points at the BFF's
> `data/static/` — the cache is shared by design, so a page rendered by
> one backend is served statically for all.

## For AI agents

[`SKILL.md`](./SKILL.md) is the wiring guide: the five moves, the wrap
grammar, the verified trace semantics, the test recipe, and the
environment gotchas — everything learned crafting the `-otel` apps.
