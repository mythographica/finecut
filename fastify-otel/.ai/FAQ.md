# FineCut — FAQ for AI Agents

> Common problems and their solutions.

## TypeScript / Type Issues

### Q: `Type 'X' is not assignable to type 'Y'` when using mnemonica instances

**A:** You're probably importing directly from `collections/*.ts` instead of using `lookup()`.

```typescript
// ❌ Wrong
import { RequestData } from './core/collections/requestTypes.js';
const rd = new RequestData({...});

// ✅ Correct
import { lookup } from 'mnemonica';
const RequestData = lookup('RequestData');
const rd = new RequestData({...});
```

### Q: `Property 'RouteData' does not exist on type '...'`

**A:** Same as above. Direct imports don't know about sub-constructors. Use `lookup()`.

### Q: `TypeRegistry` doesn't include my new type

**A:** Run `npm run tactica` to regenerate `.tactica/` after adding new `define()` calls.

```bash
npm run tactica
npx tsc --noEmit
```

### Q: `hooksOpts` generic parameters don't work

**A:** Make sure mnemonica core is rebuilt after the `hooksOpts<P, T>` change:

```bash
cd /code/mnemonica/core
npm run build
```

Then in finecut/fastify:
```typescript
// Two-parameter form
collection.registerHook('postCreation', (hookData: hooksOpts<object, ResponseLike>) => {
    // hookData.inheritedInstance is typed as ResponseLike
});
```

## Runtime Issues

### Q: Server starts but pages return 404

**A:** Check that `data/pages/` has content. The `_index/` directory must exist for the home page.

```bash
ls data/pages/_index/
# Should show: header.txt, content.txt, info.txt, blocks.txt
```

### Q: Static assets (CSS, JS) return 404

**A:** Check the URL path. Frontend static files are served from `public/` via the catch-all route. Admin assets are served via `@fastify/static` on `/admin` prefix.

### Q: Admin panel shows blank page

**A:** Check browser console for JS errors. The admin panel requires jQuery and other libraries loaded from `/admin/javascripts/`.

### Q: elFinder shows "Invalid backend configuration"

**A:** Check that `elfinder-node` is installed and the backend route is registered:

```bash
curl "http://localhost:3000/engine/elfinder?cmd=open&init=true"
```

Should return JSON with file listing.

### Q: Cache not updating after page edit

**A:** Clear static cache:

```bash
rm -rf data/static/*
# Or via API:
curl -X POST http://localhost:3000/engine/api -d "action=clear_cache"
```

The mtime-based cache check compares cache file mtime against source files. If system time is wrong, cache might appear stale or fresh incorrectly.

### Q: Tests fail with "Failed to resolve entry for package mnemonica"

**A:** mnemonica core needs to be built:

```bash
cd /code/mnemonica/core
npm run build
```

Then retry tests in finecut/fastify.

## Hook Issues

### Q: Hook not firing

**A:** Check that you registered it on the correct collection:

```typescript
// ✅ Correct — default collection (where types are defined)
import { defaultTypes } from 'mnemonica';
defaultTypes.registerHook('postCreation', ...);

// ❌ Wrong — creating a new collection
const myCollection = createTypesCollection();
myCollection.registerHook('postCreation', ...);  // Types aren't here!
```

### Q: `hookData.TypeName` is undefined

**A:** This shouldn't happen for normal instance creation. It might happen for internal mnemonica types. Always check:

```typescript
if (hookData.TypeName === 'ResponseData') { ... }
```

### Q: `preCreation` hook throws but `creationError` doesn't fire

**A:** The `creationError` hook fires on the **same collection**. Make sure both hooks are on `defaultTypes`:

```typescript
defaultTypes.registerHook('preCreation', (hookData) => {
    throw new Error('validation failed');
});

defaultTypes.registerHook('creationError', (hookData) => {
    console.log('Error caught:', hookData.inheritedInstance);
    return true; // intercept
});
```

## Template Issues

### Q: Template variable not rendering

**A:** Check the context object shape. The template engine uses `get(ctx, path)` for property access:

```typescript
// {{header.title}} → get(ctx, 'header.title')
// This does: ctx.header?.title
```

Make sure `ctx.header` exists and has a `title` property.

### Q: `{{#if !isMain}}` not working

**A:** The negation syntax is `{{#if !property}}`. Make sure there's no space between `!` and the property name:

```html
<!-- Correct -->
{{#if !isMain}}...{{/if}}

<!-- Wrong -->
{{#if ! isMain}}...{{/if}}
```

### Q: Component helper returns `[object Object]`

**A:** Components must return strings, not objects. Check that your component returns HTML:

```typescript
// ❌ Wrong
export function myComponent(ctx) {
    return { html: '<div>...' };  // Object!
}

// ✅ Correct
export function myComponent(ctx): string {
    return '<div>...</div>';
}
```

## Admin Panel Issues

### Q: Templates dropdown is empty

**A:** The dropdown is populated by `loadTemplates()` in `startup.js` which calls `GET /engine/template`. Check that endpoint returns templates:

```bash
curl http://localhost:3000/engine/template
```

If it returns `[]`, check that `views/templates/` has subdirectories other than `default`.

### Q: Page tree doesn't load

**A:** Check that `GET /engine/tree` works:

```bash
curl "http://localhost:3000/engine/tree?leaf=/top"
```

The tree is built from `data/pages/` directory listing.

### Q: Save page returns 500

**A:** Check server logs. Common causes:
- Missing `data/pages/` directory
- Permission denied writing files
- `JSON.parse()` failing on `body.data` string (frontend sends string, backend parses)

## Build / Test Issues

### Q: `npm run build` fails with TypeScript errors

**A:** Common causes:
1. Missing `.tactica/` types — run `npm run tactica`
2. mnemonica core not built — `cd ../core && npm run build`
3. New code has `any` keyword — replace with proper types
4. Unused variables — remove or prefix with `_`

### Q: Tests fail after type changes

**A:** Regenerate types and rebuild:

```bash
npm run tactica
npm run build
npm test
```

### Q: Lint errors

**A:** Run eslint with fix:

```bash
npx eslint src/ --fix
```

## Data Issues

### Q: Page content shows raw JSON

**A:** The `content.txt` should contain raw HTML/text, not JSON. Check that `contentParser()` is being called in the template:

```html
<!-- Correct -->
<div class="content">{{components.contentParser}}</div>

<!-- Wrong -->
<div class="content">{{content}}</div>
```

Wait — actually `{{content}}` should work too. The issue might be that `content.txt` contains JSON instead of HTML.

### Q: `blocks.txt` corruption (double-encoded JSON)

**A:** This was a known bug. The fix is in `pageStore.ts` — it unwraps double-encoded blocks:

```typescript
// Defensive unwrapping
if (typeof blocksContent === 'string' && blocksContent.startsWith('"')) {
    try { blocksContent = JSON.parse(blocksContent); }
    catch { /* leave as-is */ }
}
```

If you're still seeing corruption, the save path might be double-encoding. Check `setPage()` logic.

### Q: Settings not persisting

**A:** Settings are stored in `data/settings.json`. The `settings_path` action returns the pages directory path. The `settings` action reads/writes the JSON file.

Check that `data/settings.json` exists and is writable.

## Performance Issues

### Q: Page generation is slow

**A:** Check if static cache is enabled:

```bash
cat data/settings.json | grep use_static
```

If `