# FineCut — API Reference

> Complete reference for routes, components, hooks, and types.

## Table of Contents

- [Frontend Routes](#frontend-routes)
- [Admin API Routes](#admin-api-routes)
- [Template Components](#template-components)
- [Template Engine Syntax](#template-engine-syntax)
- [Hook API](#hook-api)
- [Mnemonica Types](#mnemonica-types)
- [File Utilities](#file-utilities)
- [Page Store](#page-store)

---

## Frontend Routes

### `GET /health`

Health check endpoint.

**Response:**
```json
{ "status": "ok", "mnemonica": true }
```

### `GET /test-chain`

Tests the full mnemonica chain. Creates a dummy request and walks through all 5 types.

**Response:** HTML with chain info.

### `GET /*` (Catch-All)

Main page renderer. Serves static files from `public/` first, then falls through to page rendering.

**Behavior:**
1. Check `public/{url}` for static files
2. Parse URL → resolve page path
3. Check static cache (`data/static/{path}/index.html`)
4. If cache miss: load page files → resolve components → render template → write cache
5. Return HTML

**404:** Returns `<h1>404 Not Found</h1>` if page directory doesn't exist.

**500:** Returns `<h1>500 Internal Server Error</h1>` with error message. Attempts to enrich error with mnemonica `utils.exception()`.

---

## Admin API Routes

### `GET /engine/tree?leaf={path}`

List page tree at given leaf.

**Query:**
- `leaf` — path prefix (e.g., `/top`, empty for root)

**Response:**
```json
[
  { "name": "_index", "folder": false },
  { "name": "about", "folder": true },
  { "name": "documentation", "folder": true }
]
```

### `POST /engine/tree`

Page tree CRUD operations.

**Body:**
```json
{
  "action": "get|set|mkdir|del|content_get|content_set",
  "leaf": "/top",
  "path": "new-page-name",
  "data": { ... }
}
```

**Actions:**

| Action | Description | Response |
|--------|-------------|----------|
| `get` | List tree at leaf | Tree array |
| `set` | Create new page | `{ status: "success" }` or 409 if exists |
| `mkdir` | Create directory | `{ status: "success" }` |
| `del` | Delete page/directory | `{ status: "success" }` |
| `content_get` | Get page content | Page files object |
| `content_set` | Update page content | `{ status: "success" }` |

### `GET /engine/page?leaf={path}`

Get single page content.

**Response:**
```json
{
  "header": "{...}",
  "content": "page body",
  "info": "{...}",
  "blocks": "[{...}]",
  "path": "/absolute/path"
}
```

### `GET /engine/template`

List available templates (excludes `default`).

**Response:**
```json
["documents", "blank", "Search", "Sincerely", "anotherLeftMenu"]
```

### `GET /engine/template-action?action=get&template={name}`

Get template files.

**Response:**
```json
{
  "source": "<!DOCTYPE html>...",
  "snippet": "default content...",
  "header": "{...}"
}
```

### `GET /engine/template-action?action=getInfo&template={name}`

Get template snippet and header only.

**Response:**
```json
{
  "snippet": "...",
  "header": "{...}"
}
```

### `POST /engine/template-action`

Template CRUD.

**Body:**
```json
{
  "action": "get|getInfo|add|save|del",
  "template": "my-template",
  "source": "...",
  "snippet": "...",
  "header": "..."
}
```

### `POST /engine/api`

Utility API.

**Body:**
```json
{
  "action": "clear_cache|content_get|content_set|set|settings|settings_path|mkdir|del",
  "leaf": "page-path",
  "path": "sub-path",
  "data": { ... }
}
```

**Actions:**

| Action | Description |
|--------|-------------|
| `clear_cache` | Delete `data/static/*` |
| `settings_path` | Return `settings.pages` value |
| `settings` | Read/write settings JSON |

### `GET /engine/elfinder`

elFinder 2.1 backend connector.

**Query:** Standard elFinder commands (`cmd=open`, `cmd=mkdir`, etc.)

**Response:** JSON per elFinder protocol.

---

## Template Components

All components receive `PageContext` and return HTML strings.

### `jsonInfo(ctx: PageContext): string`

Generates `<meta>` tags from `ctx.info.meta`.

```html
<meta name="author" content="John Doe">
<meta name="description" content="...">
```

### `headAdditional(): string`

Placeholder for custom head content. Currently returns empty string.

### `contentParser(ctx: PageContext): Promise<string>`

Returns page content with URL rewriting:
- `href="/"` → `href="{deep}/"` (if `deep` is set)
- `src="/"` → `src="{deep}/"`

If `ctx.header?.pageIsCode` is true, returns raw content without rewriting.

### `menuMain(ctx: PageContext): Promise<string>`

Renders top navigation from `data/menu_main.json`.

Supports:
- Plain links
- Dropdown menus with sub-items
- Active state highlighting
- Dividers and headers

### `menuLeft(ctx: PageContext): Promise<string>`

Renders left sidebar from `data/menu_left.json`.

Same features as `menuMain` but with left-nav styling.

### `menuDocuments(ctx: PageContext): Promise<string>`

Recursively lists documentation pages from `data/pages/documentation/`.

Generates nested `<ol><li><a>` structure.

---

## Template Engine Syntax

### Variable Substitution

```html
<title>{{header.title}}</title>
<p>{{content}}</p>
```

Nested access:
```html
<meta name="author" content="{{info.meta.author}}">
```

### Conditionals

```html
{{#if isMain}}
  <h1>Welcome Home</h1>
{{/if}}
```

Negated:
```html
{{#if !isMain}}
  <a href="/">← Back to Home</a>
{{/if}}
```

### Helper Partials

```html
{{jsonInfo}}
{{headAdditional}}
{{contentParser}}
{{menuMain}}
{{menuLeft}}
```

Helpers are async — the engine awaits them.

---

## Hook API

### `hooksOpts<P = object, T = P>`

```typescript
type hooksOpts<P = object, T = P> = {
    TypeName: string;
    type: TypeDef;
    args: unknown[];
    existentInstance: P;
    inheritedInstance?: T;
    creator?: { throwModificationError(error: Error): void };
};
```

### Hook Types

| Hook | When | Can Throw? | Can Intercept? |
|------|------|-----------|----------------|
| `preCreation` | Before construction | Yes (aborts) | No |
| `postCreation` | After construction | Yes | No |
| `creationError` | On error | Yes | Yes (return `true`) |

### Registration

```typescript
import { defaultTypes } from 'mnemonica';

defaultTypes.registerHook('preCreation', (hookData) => {
    // hookData.TypeName — string
    // hookData.existentInstance — parent instance
    // hookData.args — constructor arguments
});
```

### Typed Hooks

```typescript
import type { hooksOpts } from 'mnemonica';

// Pre-creation: only parent exists
type PreHook = (hookData: hooksOpts<RequestData>) => void;

// Post-creation: child instance exists
type PostHook = (hookData: hooksOpts<object, ResponseData>) => void;

// Error: error instance is in inheritedInstance
type ErrorHook = (hookData: hooksOpts) => boolean | void;
```

---

## Mnemonica Types

### Frontend Chain

| Type | Parent | Key Properties |
|------|--------|---------------|
| `RequestData` | — | `method`, `url`, `query`, `params`, `body`, `headers`, `requestId` |
| `RouteData` | `RequestData` | `pagePath`, `isMain`, `deep` |
| `PageData` | `RouteData` | `header`, `content`, `info`, `blocks`, `path` |
| `RenderData` | `PageData` | `components`, `template` |
| `ResponseData` | `RenderData` | `body`, `contentType`, `statusCode`, `fromCache` |

### Engine Chain

| Type | Parent | Key Properties |
|------|--------|---------------|
| `EngineRequest` | — | `action`, `data`, `leaf`, `path`, `template` |
| `TreeResult` | `EngineRequest` | `tree: TreeItem[]` |
| `PageResult` | `EngineRequest` | `page: rawPageFiles` |
| `CacheResult` | `EngineRequest` | `cleared: boolean` |
| `TemplateResult` | `EngineRequest` | `template: {source, snippet, header}` |

### TypeRegistry Keys

```typescript
'RequestData'
'RequestData.RouteData'
'RequestData.RouteData.PageData'
'RequestData.RouteData.PageData.RenderData'
'RequestData.RouteData.PageData.RenderData.ResponseData'
'EngineRequest'
'EngineRequest.TreeResult'
'EngineRequest.PageResult'
'EngineRequest.CacheResult'
'EngineRequest.TemplateResult'
```

---

## File Utilities

### `getfiles(name: string, dirPath: string): Promise<string>`

Read file as UTF-8 string.

### `setfiles(name: string, dirPath: string, content: string): Promise<void>`

Write file as UTF-8.

### `fileExists(path: string): Promise<boolean>`

Check if path exists.

### `getMtime(path: string): Promise<number>`

Get file modification time (ms since epoch). Returns 0 if not found.

### `mkdirp(path: string): Promise<void>`

Create directory recursively.

### `removeRecursive(path: string): Promise<boolean>`

Delete directory recursively.

### `paths(leaf: string): string`

Resolve page path. Strips `/top` prefix, returns absolute path.

---

## Page Store

### `getPage(leaf: string): Promise<rawPageFiles>`

Read all page files.

**Returns:**
```typescript
{
    header: string;    // Raw header.txt content
    content: string;   // Raw content.txt content
    info: string;      // Raw info.txt content
    blocks: string;    // Raw blocks.txt content
    path: string;      // Absolute filesystem path
}
```

### `setPage(leaf: string, data: rawPageFilesInput): Promise<void>`

Write all page files.

**Input:**
```typescript
{
    header: string;    // JSON string
    content: string;   // Raw content
    info: string;      // JSON string
    blocks: string;    // JSON string
    path?: string;     // Optional
}
```

### `parseHeader(headerRaw: string): PageHeader | null`

Parse header.txt JSON. Returns null on invalid JSON.

### `loadPageFiles(pagePath: string): Promise<PageFiles>`

Load and parse all page files into structured `PageFiles`.
