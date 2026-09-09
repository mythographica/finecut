# FineCut — Onboarding Guide for AI Agents

> **Read this first** if you've never worked on FineCut before.

## Step 1: Understand the Philosophy (2 minutes)

FineCut is a **file-based CMS with no database**. Every page is a directory containing text files. The Node.js rewrite preserves this philosophy while adding:

- **Type safety** via TypeScript + mnemonica + tactica
- **Request tracing** via mnemonica prototype chains
- **Cross-cutting concerns** via collection hooks (logging, caching, metrics)
- **Modern tooling** (Fastify, Vitest, Pino, elFinder 2.1)

## Step 2: Verify Your Environment (1 minute)

```bash
cd /code/mnemonica/finecut/fastify

# Check Node.js version
node --version    # Should be 20+

# Check if server is running
curl http://localhost:3000/health

# Check build status
npx tsc --noEmit
```

If the server is not running:
```bash
npm run build && npm start
```

## Step 3: Understand the Mnemonica Chain (3 minutes)

Every frontend request flows through this chain:

```
RequestData → RouteData → PageData → RenderData → ResponseData
```

Each arrow is `new parent.Child({ ... })`. Each step inherits all parent properties.

**File:** `src/core/collections/requestTypes.ts`

```typescript
export const RequestData = define('RequestData', function (this: {...}, req: {...}) {
    this.method = req.method;
    this.url = req.url;
    // ...
});

export const RouteData = RequestData.define('RouteData', function (this: {...}, routeInfo: {...}) {
    this.pagePath = routeInfo.pagePath;
    this.isMain = routeInfo.isMain;
    this.deep = routeInfo.deep;
});

// ... PageData, RenderData, ResponseData
```

**Key insight:** The `this` type in each `define()` callback describes what properties the instance will have. Tactica reads these and generates `.tactica/types.ts`.

## Step 4: Understand `lookup()` (2 minutes)

```typescript
// ❌ WRONG — untyped, loses sub-constructor knowledge
import { RequestData } from './core/collections/requestTypes.js';
const rd = new RequestData({...});
// rd.RouteData is NOT known to TypeScript

// ✅ CORRECT — fully typed through TypeRegistry
import { lookup } from 'mnemonica';
const RequestData = lookup('RequestData');
const rd = new RequestData({...});
// rd.RouteData is fully typed — intellisense works
```

`lookup('X')` returns a constructor typed through the augmented `TypeRegistry`. This is the **only** way to get typed mnemonica constructors.

## Step 5: Read the Existing Code (5 minutes)

Read these files in order:

1. `src/core/collections/requestTypes.ts` — See how the chain is defined
2. `src/routes/frontend.ts` — See how the chain is used in the catch-all route
3. `src/plugins/pino-logger.ts` — See hook-based logging
4. `src/core/server.ts` — See how hooks are registered + cache hook
5. `src/lib/components.ts` — See template helpers
6. `src/lib/templateEngine.ts` — See the template compiler

## Step 6: Run the Tests (1 minute)

```bash
npm test
```

Expected output: 60 tests passing across 7 test files.

## Step 7: Understand the Admin Panel (2 minutes)

The admin panel is a single-page app served from `public/admin.html`. It communicates with the backend via:

| Endpoint | Purpose |
|----------|---------|
| `GET /engine/tree` | Page tree listing |
| `POST /engine/tree` | Page CRUD (get, set, del, mkdir, content_get, content_set) |
| `GET /engine/page` | Get single page |
| `GET /engine/template` | List templates |
| `GET/POST /engine/template-action` | Template CRUD |
| `POST /engine/api` | Utility (clear_cache, settings, settings_path) |
| `GET /engine/elfinder` | elFinder 2.1 backend |

The admin frontend is **ported legacy jQuery code** (`public/startup.js`, ~1400 lines). It's complex but functional. Be careful when modifying it.

## Step 8: Common Tasks

### Adding a new component (template helper)

1. Add function to `src/lib/components.ts`
2. Register in `src/lib/registerHelpers.ts`
3. Use in template: `{{components.yourHelper}}`

### Adding a new route

1. Add file to `src/routes/engine/` or modify `src/routes/frontend.ts`
2. Register in `src/core/server.ts`
3. Add integration test to `test/integration/`
4. Verify: `npx tsc --noEmit && npm test`

### Adding a new type to the chain

1. Add `define()` in `src/core/collections/requestTypes.ts`
2. Run `npm run tactica`
3. Use via `lookup()` in routes
4. Verify: `npx tsc --noEmit`

### Modifying hooks

1. Edit `src/plugins/pino-logger.ts` for logging
2. Edit `src/core/server.ts` for cache/validation hooks
3. Add tests to `test/integration/hooks.test.ts`

## Step 9: What NOT to Do

| Don't | Because |
|-------|---------|
| Use `any` | Strict TypeScript, zero tolerance |
| Write `as unknown as` | Use `lookup()` instead |
| Edit `.tactica/` files | They're generated; changes will be lost |
| Put cache logic in route handlers | Use `postCreation` hook |
| Put logging in route handlers | Use `preCreation`/`postCreation` hooks |
| Import from `collections/*.js` directly | Use `lookup()` for typing |
| Forget to run `npm run tactica` after type changes | TypeRegistry will be stale |

## Step 10: Getting Help

- Check [FAQ.md](FAQ.md) for common errors
- Check [DEBUG.md](DEBUG.md) for debugging techniques
- Check [ARCHITECTURE.md](ARCHITECTURE.md) for deep dives
- The `AGENTS.md` in the project root has the original (still valid) instructions
