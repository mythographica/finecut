# FineCut CMS

> A file-based Content Management System built on [mnemonica](https://github.com/wentout/mnemonica) instance inheritance, Fastify, and zero-configuration static generation.

---

## Table of Contents

- [Purpose](#purpose)
- [Architecture](#architecture)
- [Usage Patterns](#usage-patterns)
- [Mood and Meaning](#mood-and-meaning)
- [Philosophy](#philosophy)
- [Traits](#traits)
- [Liability and Maintainability](#liability-and-maintainability)
- [Tracing Approach](#tracing-approach)
- [Mnemonica Coding Style](#mnemonica-coding-style)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Development](#development)

---

## Purpose

FineCut CMS serves content from the filesystem. It reads pages from `data/pages/`, renders them through templates in `views/templates/`, and writes static HTML to `data/static/` for production serving.

It is designed for:

- **Documentation sites** — hierarchical page trees with recursive navigation
- **Landing pages** — template-driven, component-based rendering
- **Content workflows** — admin API for CRUD operations on pages
- **Static generation** — automatic cache writes via mnemonica hooks

The system does not use a database. Every page is a directory containing:

```
data/pages/hello-world/
├── header.txt   # JSON metadata (title, template, keywords, etc.)
├── content.txt  # Main content (HTML or plain text)
├── info.txt     # JSON extra metadata
└── blocks.txt   # JSON array of named blocks
```

---

## Architecture

### Request Lifecycle

Every HTTP request flows through a **mnemonica instance chain**:

```
RequestData → RouteData → PageData → RenderData → ResponseData
```

| Type | Purpose | Properties |
|------|---------|------------|
| `RequestData` | Raw HTTP request | `method`, `url`, `query`, `params`, `body`, `headers`, `requestId` |
| `RouteData` | Parsed route info | `pagePath`, `isMain`, `deep` |
| `PageData` | Loaded page files | `header`, `content`, `info`, `blocks`, `path` |
| `RenderData` | Resolved components | `components`, `template` |
| `ResponseData` | Final output | `body`, `contentType`, `statusCode`, `fromCache` |

Each step inherits from the previous via mnemonica's `ProtoFlat` mechanism — parent properties are available on the child unless overridden.

### Engine Chain (Admin API)

Admin operations use a separate chain:

```
EngineRequest → TreeResult | PageResult | CacheResult | TemplateResult
```

This isolates admin data shapes from frontend rendering.

### Directory Structure

```
finecut/fastify/
├── src/
│   ├── core/
│   │   ├── server.ts              # Fastify bootstrap, hook wiring
│   │   ├── settings.ts            # Application settings
│   │   └── collections/
│   │       ├── requestTypes.ts    # Frontend mnemonica chain
│   │       └── engineTypes.ts     # Admin API mnemonica chain
│   ├── routes/
│   │   ├── frontend.ts            # Catch-all page renderer
│   │   └── engine/                # Admin API routes
│   │       ├── tree_pages.ts      # Page tree CRUD
│   │       ├── api.ts             # Utility API (cache, settings)
│   │       ├── template.ts        # Template listing
│   │       ├── template_action.ts # Template CRUD
│   │       ├── admin.ts           # Admin panel serving
│   │       └── settings.ts        # Settings API
│   ├── lib/
│   │   ├── fileUtils.ts           # Pure file I/O functions
│   │   ├── pageStore.ts           # Page read/write operations
│   │   ├── engineActions.ts       # Shared admin handlers
│   │   ├── components.ts          # Template component helpers
│   │   ├── templateEngine.ts      # Minimal template compiler
│   │   └── registerHelpers.ts     # Helper registration
│   ├── plugins/
│   │   ├── pino-logger.ts         # Pino + mnemonica hooks
│   │   └── static-cache.ts        # mtime-based static cache
│   └── types/
│       └── index.ts               # Core type definitions
├── test/                          # Vitest tests
├── public/                        # Admin panel static assets
├── data/
│   ├── pages/                     # Content pages
│   └── static/                    # Generated static HTML
├── views/
│   └── templates/                 # HTML templates
└── .tactica/                      # Generated mnemonica types
```

---

## Usage Patterns

### Frontend Rendering

```typescript
// src/routes/frontend.ts
const requestData = new RequestData({ method: 'GET', url: '/hello', ... });
const routeData = new requestData.RouteData({ pagePath: '/hello', isMain: false, deep: '' });
const pageData = new routeData.PageData(await loadPageFiles('/path/to/hello'));
const renderData = new pageData.RenderData({ jsonInfo: '...', contentParser: '...' });
const responseData = new renderData.ResponseData({ body: html, statusCode: 200, ... });
```

### Admin API

```typescript
// src/routes/engine/tree_pages.ts
const engineRequest = new EngineRequest({ body: req.body });
const treeResult = new engineRequest.TreeResult({ tree: [...] });
return reply.send(treeResult.tree);
```

### Template Components

Components are pure functions that receive `PageContext` and return HTML strings:

```typescript
// src/lib/components.ts
export async function menuMain (ctx: PageContext): Promise<string> {
    // Read menu_main.json, render navigation
}
```

### Hook-Based Caching

Static cache writes happen automatically via mnemonica collection hooks:

```typescript
// src/core/server.ts
defaultTypes.registerHook('postCreation', (hookData: hooksOpts) => {
    if (hookData.TypeName === 'ResponseData') {
        const instance = hookData.inheritedInstance as Record<string, unknown>;
        if (!instance.fromCache && instance.statusCode === 200) {
            writeStaticCache(instance.pagePath as string, instance.body as string);
        }
    }
});
```

### Template Syntax

Templates use minimal syntax:

```html
<!-- views/templates/default/index.html -->
<!DOCTYPE html>
<html>
<head>
    <title>{{header.title}}</title>
    {{>headAdditional}}
</head>
<body>
    {{#if isMain}}
        <h1>{{header.title}}</h1>
    {{/if}}
    <main>{{components.contentParser}}</main>
</body>
</html>
```

- `{{obj.path}}` — property access
- `{{#if obj.path}}...{{/if}}` — conditional
- `{{>helperName}}` — partial include

---

## Mood and Meaning

FineCut is **deliberately small**. It does not compete with WordPress or Drupal. It competes with "a directory of markdown files and a build script."

The mood is:

- **Transparent** — every page is a directory you can `ls`, `cat`, and `git diff`
- **Predictable** — the mnemonica chain makes data flow explicit; no magic globals
- **Fast** — static cache generation means production serving is `O(1)` file reads
- **Repairable** — if something breaks, you can fix it with `rm -rf data/static/` and a refresh

The name "FineCut" refers to the editing process: rough content (the `content.txt`) is refined through templates and components into a polished page.

---

## Philosophy

### Instance Inheritance as Request State

Traditional web frameworks store request state in mutable objects (`req`, `res`, `context`). FineCut stores state in an **immutable prototype chain**:

```typescript
const requestData = new RequestData({ ... });
const routeData   = new requestData.RouteData({ ... });
const pageData    = new routeData.PageData({ ... });
```

Each step is a new instance that inherits from the previous. You cannot accidentally mutate `requestData` from `pageData` — they are separate objects linked by prototype.

This makes the request lifecycle:

1. **Observable** — hooks fire at every transition
2. **Traceable** — `instanceof` works across the chain
3. **Type-safe** — TypeScript knows every property at every step

### File-Based Truth

The filesystem is the source of truth. There is no database schema to migrate, no ORM to configure, no connection pool to monitor. Pages are directories; content is text files.

This is a feature, not a limitation. It means:

- **Version control** — `git log` shows content history
- **Backup** — `rsync` is sufficient
- **Migration** — `cp -r` moves sites between servers
- **Debugging** — `cat data/pages/hello/header.txt` reveals page state

### Cross-Cutting Concerns via Hooks

Caching, logging, and metrics are **not** embedded in route handlers. They are registered as mnemonica collection hooks that observe the chain from outside:

```typescript
// Logging
collection.registerHook('preCreation', (hookData) => { ... });

// Caching
collection.registerHook('postCreation', (hookData) => { ... });

// Timing
collection.registerHook('preCreation',  (hookData) => { timings.set(...); });
collection.registerHook('postCreation', (hookData) => { metrics.histogram(...); });
```

This separation means route handlers contain **only business logic**.

---

## Traits

| Trait | Description |
|-------|-------------|
| **Type-safe** | Zero `any` casts in production code; full TypeScript coverage |
| **Hook-driven** | Lifecycle hooks for logging, caching, metrics, validation |
| **Static-first** | Automatic static HTML generation; optional dynamic serving |
| **Component-based** | Pure functions generate HTML fragments from page context |
| **Template-agnostic** | Minimal template engine; swappable for React/Vue/Handlebars |
| **Testable** | Pure functions + dependency injection = unit tests without mocks |
| **File-based** | No database; content lives in `data/pages/` |
| **Hierarchical** | Recursive directory trees for documentation and nested content |

---

## Liability and Maintainability

### What FineCut Is Good For

- Documentation sites with hierarchical navigation
- Small-to-medium content sites (< 10,000 pages)
- Teams that prefer Git-based workflows over database admin panels
- Projects where build-time generation is acceptable

### What FineCut Is Not Good For

- Real-time collaborative editing (no operational transforms)
- User-generated content at scale (no indexing, no search)
- Complex access control (no RBAC, no ACL)
- E-commerce (no transactions, no inventory)

### Maintenance Burden

| Area | Burden | Mitigation |
|------|--------|------------|
| Type safety | Low | Tactica generates types from `define()` calls |
| Static cache | Low | mtime-based invalidation is automatic |
| Templates | Low | Minimal syntax; no build step |
| File I/O | Medium | Async operations; error handling required |
| Testing | Low | Pure functions are trivial to unit test |

---

## Tracing Approach

Every request leaves a trace through the mnemonica chain and Pino logs:

### Mnemonica Hook Tracing

```typescript
// src/plugins/pino-logger.ts
collection.registerHook('preCreation', (hookData: hooksOpts) => {
    log.info({
        event    : 'transform.start',
        TypeName : hookData.TypeName,
        requestId: (hookData.existentInstance as Record<string, unknown>)?.requestId
    }, 'starting transformation');
});
```

Log output:

```json
{
  "event": "transform.start",
  "TypeName": "RouteData",
  "requestId": "req-123",
  "msg": "starting transformation"
}
```

### Request Correlation

The `requestId` from `RequestData` flows through every step of the chain, allowing distributed tracing without external services.

### Static Cache Tracing

Cache hits and misses are logged via the same hook system:

```typescript
// Cache hit: no mnemonica chain executed
// Cache miss: full chain + static write
```

---

## Mnemonica Coding Style

### Define Types with Explicit `this`

```typescript
export const RequestData = define('RequestData', function (
    this: { method: string; url: string; ... },
    req: { method: string; url: string; ... }
) {
    this.method = req.method;
    this.url = req.url;
    // ...
});
```

The `this` type documents what the instance will contain. It is a contract.

### Use `lookup` for Type-Safe Retrieval

```typescript
// ✅ Correct — typed through TypeRegistry
const RequestData = lookup('RequestData');
const requestData = new RequestData({ ... });

// ❌ Wrong — untyped, requires casts
import { RequestData } from './collections/requestTypes.js';
const requestData = new RequestData({ ... }) as unknown as RequestDataInstance;
```

### Chain with `new parent.Child()`

```typescript
const routeData = new requestData.RouteData({ ... });
const pageData = new routeData.PageData({ ... });
```

Each step inherits all parent properties. No manual merging, no `Object.assign`.

### Prefer `type` over `interface`

```typescript
// ✅ Correct
type PageHeader = { title: string; template: string; ... };

// ❌ Wrong (for mnemonica)
interface PageHeader { title: string; template: string; ... }
```

Mnemonica's `ProtoFlat` works with intersection types. `type` aliases compose more predictably than `interface` merging.

### No `any` — Ever

```typescript
// ❌ Forbidden
const data = req.body as any;

// ✅ Required
const data = req.body as Record<string, unknown>;
```

If you cannot type it, use `unknown` and narrow.

### Hooks Are Cross-Cutting

```typescript
// ✅ Correct — observe from outside
collection.registerHook('postCreation', (hookData) => {
    if (hookData.TypeName === 'ResponseData') {
        writeStaticCache(...);
    }
});

// ❌ Wrong — inline in route handler
const html = await render(...);
await writeStaticCache(pagePath, html); // Don't do this
```

---

## Getting Started

### Installation

```bash
cd finecut/fastify
npm install
```

### Generate Types

```bash
npm run tactica
```

This scans `src/core/collections/*.ts` for `define()` calls and generates `.tactica/types.ts` + `.tactica/registry.ts`.

### Build

```bash
npm run build
```

### Run

```bash
npm start
```

### Development Mode

```bash
npm run build:watch  # Terminal 1: TypeScript watch
npm run dev          # Terminal 2: Node.js watch
```

### Test

```bash
npm test
```

---

## API Reference

### Frontend Routes

| Route | Description |
|-------|-------------|
| `GET /health` | Health check |
| `GET /test-chain` | Mnemonica chain test |
| `GET /*` | Catch-all page renderer |

### Admin API

| Route | Method | Action |
|-------|--------|--------|
| `/engine/tree` | `GET` | List page tree |
| `/engine/tree` | `POST` | Page CRUD (set, mkdir, del, content_get, content_set) |
| `/engine/page` | `GET` | Get single page content |
| `/engine/api` | `POST` | Utility (clear_cache, settings, etc.) |
| `/engine/template` | `GET` | List available templates |
| `/engine/template` | `POST` | Template CRUD |
| `/engine/settings` | `GET/POST` | Settings management |
| `/admin` | `GET` | Admin panel |

---

## Development

### Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | TypeScript compilation |
| `npm run build:watch` | TypeScript watch mode |
| `npm run dev` | Node.js watch mode |
| `npm test` | Vitest run |
| `npm run test:watch` | Vitest watch mode |
| `npm run tactica` | Regenerate mnemonica types |
| `npm run cache:clear` | Clear static cache |

### Adding a New Component

1. Define the function in `src/lib/components.ts`
2. Add it to the `components` object in `src/routes/frontend.ts`
3. Reference it in templates with `{{>componentName}}`

### Adding a New Type to the Chain

1. Add `define()` call in `src/core/collections/requestTypes.ts`
2. Run `npm run tactica` to regenerate types
3. Import the typed constructor with `lookup()`
4. Use `new parent.NewType({ ... })` in route handlers

---

## License

MIT
