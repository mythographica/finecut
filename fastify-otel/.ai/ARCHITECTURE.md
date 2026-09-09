# FineCut — Architecture Deep Dive

> How the system works under the hood.

## 1. Request Lifecycle

### 1.1 Frontend Request Flow

```
HTTP GET /
    │
    ▼
┌─────────────────────────────────────────┐
│  fastify routes/frontend.ts            │
│  app.get('/*', async (req, reply) => { │
│    ...                                  │
│  })                                     │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  Step 1: RequestData                    │
│  Constructor: lookup('RequestData')│
│  Props: method, url, query, params,     │
│         body, headers, requestId        │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  Step 2: RouteData                      │
│  Constructor: requestData.RouteData     │
│  Props: pagePath, isMain, deep          │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  Step 3: PageData                       │
│  Constructor: routeData.PageData        │
│  Props: header, content, info, blocks,  │
│         path                            │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  Step 4: RenderData                     │
│  Constructor: pageData.RenderData       │
│  Props: components, template            │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  Step 5: ResponseData                   │
│  Constructor: renderData.ResponseData   │
│  Props: body, contentType, statusCode,  │
│         fromCache                       │
└─────────────────────────────────────────┘
    │
    ▼
  reply.send(responseData.body)
```

### 1.2 Admin API Request Flow

```
HTTP POST /engine/tree
    │
    ▼
┌─────────────────────────────────────────┐
│  routes/engine/tree_pages.ts           │
│  app.post('/engine/tree', ...)          │
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  Step 1: EngineRequest                  │
│  Constructor: lookup('EngineRequest')│
│  Props: action, data, leaf, path,       │
│         template                        │
└─────────────────────────────────────────┘
    │
    ▼ (branches to sibling types)
┌─────────────────────────────────────────┐
│  Step 2a: TreeResult                    │
│  Constructor: engineRequest.TreeResult  │
│  Props: tree (TreeItem[])               │
├─────────────────────────────────────────┤
│  Step 2b: PageResult                    │
│  Constructor: engineRequest.PageResult  │
│  Props: page (rawPageFiles)             │
├─────────────────────────────────────────┤
│  Step 2c: CacheResult                   │
│  Constructor: engineRequest.CacheResult │
│  Props: cleared (boolean)               │
├─────────────────────────────────────────┤
│  Step 2d: TemplateResult                │
│  Constructor: engineRequest.TemplateResult│
│  Props: template (source, snippet,      │
│         header)                         │
└─────────────────────────────────────────┘
```

**Key difference:** The frontend chain is progressive (each step enriches the previous). The engine chain branches to siblings (each result is a different shape from the same root).

## 2. The Mnemonica Type System

### 2.1 `ProtoFlat<Parent, Child>`

Tactica generates types using mnemonica's `ProtoFlat` utility:

```typescript
// From .tactica/types.ts
export type RequestData_RouteData = ProtoFlat<RequestData, {
    pagePath: string;
    isMain: boolean;
    deep: string;
    PageData: new (...) => RequestData_RouteData_PageData;
    RouteData: undefined;  // self-reference blocked
}>;
```

`ProtoFlat` merges parent properties with child properties in a flat object type. This is why instances have intellisense for all parent properties.

### 2.2 TypeRegistry Augmentation

```typescript
// From .tactica/registry.ts
declare module 'mnemonica' {
    interface TypeRegistry {
        'RequestData': new (...) => RequestData;
        'RequestData.RouteData': new (...) => RequestData_RouteData;
        'RequestData.RouteData.PageData': new (...) => RequestData_RouteData_PageData;
        // ... etc
    }
}
```

This merges into the `mnemonica` module, making `lookup('X')` return the correct constructor type.

### 2.3 Two-Parameter `hooksOpts<P, T>`

After the recent update, mnemonica core supports:

```typescript
export type hooksOpts<P = object, T = P> = {
    existentInstance: P;      // parent instance (proto)
    inheritedInstance?: T;    // child instance (type being created)
    // ...
};
```

This lets hooks type the parent and child separately:

```typescript
// Pre-creation: existentInstance is the parent being extended
collection.registerHook('preCreation', (hookData: hooksOpts<RequestData>) => {
    hookData.existentInstance.requestId;  // typed!
});

// Post-creation: inheritedInstance is the new child
collection.registerHook('postCreation', (hookData: hooksOpts<object, ResponseData>) => {
    hookData.inheritedInstance.body;  // typed!
});
```

## 3. Hook Architecture

### 3.1 Hook Registration

Hooks are registered on `defaultTypes` (mnemonica's default collection) in `src/core/server.ts`:

```typescript
import { defaultTypes } from 'mnemonica';

// Logging (from pino-logger.ts)
setupCollectionLogging(defaultTypes, logger);

// Validation
defaultTypes.registerHook('preCreation', (hookData) => { ... });

// Caching
defaultTypes.registerHook('postCreation', (hookData) => { ... });
```

**All hooks fire for EVERY type in the collection.** Filter by `hookData.TypeName` if needed.

### 3.2 Hook Execution Order

For a `new parent.Child({...})` call:

1. `preCreation` — fires before construction
   - `existentInstance` = parent
   - `args` = constructor arguments
   - Throwing here aborts construction and fires `creationError`

2. Construction — the `define()` callback runs
   - `this` is the new instance
   - Properties are assigned

3. `postCreation` — fires after construction
   - `existentInstance` = parent
   - `inheritedInstance` = new child instance
   - Use for caching, logging, metrics

4. `creationError` — fires if construction threw
   - `existentInstance` = parent
   - `inheritedInstance` = the error (or error wrapper)
   - Return `true` to intercept (don't throw to caller)

### 3.3 Request-Scoped Timing

```typescript
const timings = new Map<string, number>();

defaultTypes.registerHook('preCreation', (hookData) => {
    if (hookData.TypeName === 'RequestData') {
        const reqId = hookData.existentInstance.requestId;
        timings.set(reqId, performance.now());
    }
});

defaultTypes.registerHook('postCreation', (hookData) => {
    if (hookData.TypeName === 'ResponseData') {
        const reqId = hookData.inheritedInstance.requestId;
        const start = timings.get(reqId);
        if (start) {
            const duration = Math.round(performance.now() - start);
            timings.delete(reqId);
            logger.info({ duration }, 'request completed');
        }
    }
});
```

This measures the full chain duration without any code in route handlers.

## 4. Static Cache System

### 4.1 Cache Check (`checkStaticCache`)

Before rendering, `frontend.ts` calls `checkStaticCache(pagePath, header)`:

```typescript
export async function checkStaticCache(pagePath, header) {
    const staticFile = path.join(ROOT, settings.static, pagePath, 'index.html');
    if (!await fileExists(staticFile)) return null;

    const staticMtime = await getMtime(staticFile);
    const dynamicMtime = await getMtime(path.join(ROOT, settings.pages, pagePath, 'header.txt'));
    const settingsMtime = await getMtime(path.join(ROOT, 'core', 'settings.js'));
    const engineMtime = await getMtime(path.join(ROOT, 'core', 'server.js'));
    const templateMtime = await getMtime(templatePath);

    if (staticMtime > allOtherMtimes) {
        return fs.readFile(staticFile, 'utf-8');  // Cache hit!
    }
    return null;  // Cache miss — needs re-render
}
```

### 4.2 Cache Write (Hook-Based)

```typescript
// In src/core/server.ts
defaultTypes.registerHook('postCreation', (hookData: hooksOpts<object, ResponseLike>) => {
    if (hookData.TypeName === 'ResponseData') {
        const instance = hookData.inheritedInstance;
        if (instance && !instance.fromCache && instance.statusCode === 200) {
            writeStaticCache(instance.pagePath || '', instance.body || '');
        }
    }
});
```

**Why hooks?** The route handler doesn't know about caching. The cache policy is declared, not embedded.

### 4.3 Cache Invalidation

Cache is invalidated automatically when:
- Page `header.txt` is saved (mtime newer than cache)
- Template `index.html` is saved (mtime newer than cache)
- `settings.js` is saved (mtime newer than cache)
- Manual: `rm -rf data/static/*` or `curl -X POST /engine/api -d "action=clear_cache"`

## 5. Template Engine

### 5.1 Compilation

```typescript
// src/lib/templateEngine.ts
function compile(template: string): (ctx: object, helpers: Map, get: Function) => string {
    const code = template
        .replace(/\{\{#if\s+!([^}]+)\}\}/g, '${!get(ctx,"$1") ? \`')
        .replace(/\{\{#if\s+([^}]+)\}\}/g, '${get(ctx,"$1") ? \`')
        .replace(/\{\{\/if\}\}/g, '\` : \`\`}')
        .replace(/\{\{>(\w+)\}\}/g, '${await getHelper("$1", ctx, helpers)}')
        .replace(/\{\{([^}]+)\}\}/g, '${get(ctx,"$1")}');

    return new Function('ctx', 'helpers', 'get', `return \`${code}\`;`);
}
```

Uses `new Function()` for runtime compilation. Simple and sufficient for CMS use case.

### 5.2 Context Structure

```typescript
type TemplateContext = {
    header: PageHeader | null;      // From PageData
    content: string;                // From PageData
    info: Record<string, unknown>;  // From PageData
    blocks: Array<{name, value}>;   // From PageData
    components: Record<string, string>; // Resolved by RenderData
    isMain: boolean;                // From RouteData
    deep: string;                   // From RouteData
    pagePath: string;               // From RouteData
    path: string;                   // From PageData
};
```

### 5.3 Component Helpers

Components are pure functions registered with the template engine:

```typescript
// src/lib/components.ts
export function jsonInfo(ctx: PageContext): string { ... }
export async function contentParser(ctx: PageContext): Promise<string> { ... }
export async function menuMain(ctx: PageContext): Promise<string> { ... }
export async function menuLeft(ctx: PageContext): Promise<string> { ... }
export function headAdditional(): string { ... }
```

They receive `PageContext` (a `Pick` from `RequestData_RouteData_PageData`) and return HTML strings.

## 6. Page Storage

### 6.1 Page Directory Structure

```
data/pages/hello-world/
├── header.txt   → {"title":"Hello","template":"default",...}
├── content.txt  → <p>Hello world!</p>
├── info.txt     → {"meta":{"author":"..."}}
└── blocks.txt   → [{"name":"sidebar","value":"..."}]
```

### 6.2 Page Operations (`pageStore.ts`)

```typescript
export async function getPage(leaf: string): Promise<rawPageFiles> {
    // Reads all 4 files from data/pages/{leaf}/
    // Returns: { header, content, info, blocks, path }
}

export async function setPage(leaf: string, data: rawPageFilesInput): Promise<void> {
    // Writes all 4 files to data/pages/{leaf}/
    // Creates directory if needed
}
```

### 6.3 Tree Listing

```typescript
// GET /engine/tree?leaf=/top
// Returns: [{ name: "_index", folder: false }, { name: "about", folder: true }, ...]
```

The `folder` flag indicates whether the directory has subdirectories.

## 7. Admin Panel Architecture

### 7.1 Frontend (`public/admin.html` + `public/startup.js`)

- Single-page jQuery app (ported from PHP legacy)
- Tabs: Pages, Templates, Files, Settings
- ACE editor for code editing
- Custom tree control (`public/tree_custom/`)

### 7.2 Backend Routes

| Route | Handler | Purpose |
|-------|---------|---------|
| `/admin` | `admin.ts` | Serves `public/admin.html` |
| `/engine/elfinder` | `admin.ts` | elFinder 2.1 backend via `elfinder-node` |
| `/engine/tree` | `tree_pages.ts` | Page tree API |
| `/engine/template` | `template.ts` | Template listing |
| `/engine/template-action` | `template_action.ts` | Template CRUD |
| `/engine/api` | `api.ts` | Utility API |

### 7.3 elFinder Integration

elFinder 2.1 frontend assets are served from `node_modules/elfinder-npm/` via `/elfinder/*` route. The backend uses `elfinder-node` package with a driver registry connected to the local filesystem (`process.cwd()`).

## 8. Error Handling

### 8.1 Frontend Errors

```typescript
// frontend.ts catch block
try {
    // ... full chain
} catch (err) {
    const error = err as Error;
    // Try to enrich with mnemonica context
    if (chainInstance) {
        try {
            const exceptionCtor = (chainInstance as Record<string, unknown>).exception;
            if (exceptionCtor) {
                displayError = new (exceptionCtor as new (e: Error) => Error)(error);
            }
        } catch { /* fallback */ }
    }
    reply.code(500).type('text/html').send(`<h1>500</h1><pre>${displayError.message}</pre>`);
}
```

### 8.2 Hook Errors

If a `preCreation` hook throws:
1. Construction is aborted
2. `creationError` hook fires
3. If `creationError` returns `true`, the error is returned (not thrown)
4. If `creationError` doesn't return `true`, the error propagates

### 8.3 Mnemonica Exception Enrichment

```typescript
import { utils, getProps } from 'mnemonica';

// Creating an enriched error
const enriched = new utils.exception(routeData, originalError);
// enriched is a plain Error: only .message and .stack (merged lifecycle
// trace) are own properties. The data lives in props, read via getProps:
// - getProps(enriched).args (extra arguments passed to the exception call)
// - getProps(enriched).originalError
// - getProps(enriched).instance (the mnemonica instance)
// No bound methods: use utils.extract(getProps(enriched).instance) /
// utils.parse(getProps(enriched).instance) for properties and structural info.
```

## 9. Testing Architecture

### 9.1 Unit Tests

Test pure functions in isolation:
- `fileUtils.test.ts` — File I/O utilities
- `templateEngine.test.ts` — Template compilation
- `components.test.ts` — Component helpers

### 9.2 Integration Tests

Test full request/response cycles:
- `frontend.route.test.ts` — Page rendering, 404, etc.
- `engine.routes.test.ts` — All admin API endpoints
- `hooks.test.ts` — Hook firing and chain tracing
- `elfinder.test.ts` — elFinder backend commands

### 9.3 Test Fixtures

Tests use real files in `data/pages/` and `views/templates/`. No mocks for file I/O — tests hit the actual filesystem.

## 10. Directory Resolution

### 10.1 `resolvePaths()`

```typescript
// src/lib/fileUtils.ts
export function paths(leaf: string): string {
    // Strips '/top' prefix (legacy PHP convention)
    // Returns absolute path to data/pages/{leaf}/
}
```

### 10.2 Root Directory

```typescript
const ROOT = process.cwd();  // /code/mnemonica/finecut/fastify
```

All paths are resolved relative to `ROOT`.
