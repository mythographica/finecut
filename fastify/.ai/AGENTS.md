# FineCut CMS — Agent Documentation

> **Start here.** This is the main entry point for AI agents working with FineCut.

## What is FineCut?

FineCut is a **file-based CMS** (no database) originally written in PHP 16 years ago, now rebuilt on **Node.js + Fastify + TypeScript + mnemonica**. Every HTTP request creates a typed, traceable dataflow through mnemonica's prototype inheritance chain.

## Quick Start (30 seconds)

```bash
# 1. Build
cd /code/mnemonica/finecut/fastify
npm run build

# 2. Test
npm test          # 60 tests, 7 files

# 3. Start (if not already running)
npm start         # http://localhost:3000

# 4. Verify
curl http://localhost:3000/health
# → {"status":"ok","mnemonica":true}
```

## Critical Rules

1. **Use `lookup()` for all mnemonica constructors** — never direct import + cast
2. **Never write `as unknown as`** — if you need it, you're doing something wrong
3. **Never edit `.tactica/` files** — run `npm run tactica` to regenerate
4. **Hooks are cross-cutting** — zero business logic in route handlers for logging/cache/metrics
5. **Zero `any` keyword** — use `unknown` and narrow, or define proper types

## Read Next

| File | Purpose | Read When |
|------|---------|-----------|
| [ONBOARDING.md](ONBOARDING.md) | First-time setup for agents | You're new to this project |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Deep dive into dataflow, chains, hooks | You need to understand how it works |
| [API.md](API.md) | Route reference, component API, hooks API | You're adding/modifying routes |
| [CODING.md](CODING.md) | Conventions, patterns, type system | You're writing new code |
| [FAQ.md](FAQ.md) | Common errors and solutions | Something broke |
| [DEBUG.md](DEBUG.md) | Debugging techniques, logging | You need to trace a bug |

## Directory Map

```
finecut/fastify/
├── src/
│   ├── core/
│   │   ├── server.ts              # Fastify bootstrap, hook wiring
│   │   ├── settings.ts            # App settings (JSON-based)
│   │   └── collections/
│   │       ├── requestTypes.ts    # Frontend chain: RequestData → ... → ResponseData
│   │       └── engineTypes.ts     # Admin chain: EngineRequest → TreeResult/PageResult/...
│   ├── routes/
│   │   ├── frontend.ts            # Catch-all /* route
│   │   └── engine/                # Admin API routes
│   │       ├── api.ts             # clear_cache, settings
│   │       ├── tree_pages.ts      # Page tree CRUD
│   │       ├── template.ts        # Template listing
│   │       ├── template_action.ts # Template CRUD
│   │       ├── settings.ts        # Settings read/write
│   │       └── admin.ts           # elFinder backend, admin redirect
│   ├── lib/
│   │   ├── fileUtils.ts           # File I/O utilities
│   │   ├── pageStore.ts           # Page read/write operations
│   │   ├── engineActions.ts       # Shared admin handlers
│   │   ├── components.ts          # Template helpers (menus, content parser, etc.)
│   │   ├── templateEngine.ts      # {{var}}, {{#if}}, {{>helper}} compiler
│   │   ├── registerHelpers.ts     # Registers components with template engine
│   │   └── chainTrace.ts          # Chain introspection utilities
│   ├── plugins/
│   │   ├── pino-logger.ts         # Pino + mnemonica hook integration
│   │   └── static-cache.ts        # mtime-based cache check/write
│   └── types/
│       └── index.ts               # App-level types (PageHeader, TemplateContext, etc.)
├── data/
│   ├── pages/                     # Content pages (each is a directory)
│   │   └── _index/
│   │       ├── header.txt         # JSON: title, template, keywords, etc.
│   │       ├── content.txt        # Page body
│   │       ├── info.txt           # JSON extra metadata
│   │       └── blocks.txt         # JSON array of blocks
│   ├── static/                    # Generated static HTML cache
│   ├── menu_main.json             # Main navigation menu
│   ├── menu_left.json             # Left sidebar menu
│   └── settings.json              # App settings
├── views/
│   └── templates/                 # HTML templates
│       └── default/
│           ├── index.html         # Template markup
│           ├── snippet.txt        # Default page properties
│           └── header.txt         # Default page header
├── public/                        # Admin panel static assets
├── test/                          # Vitest tests
│   ├── unit/
│   │   ├── fileUtils.test.ts
│   │   ├── templateEngine.test.ts
│   │   └── components.test.ts
│   └── integration/
│       ├── frontend.route.test.ts
│       ├── engine.routes.test.ts
│       ├── hooks.test.ts
│       └── elfinder.test.ts
├── .tactica/                      # GENERATED — do not edit
│   ├── types.ts                   # ProtoFlat instance types
│   ├── registry.ts                # TypeRegistry augmentation
│   ├── definitions.json           # Type definitions
│   └── usages.json                # Type usage locations
└── .ai/                           # ← You are here
```

## Key Technologies

| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 20+ | Runtime |
| Fastify | 5.x | Web framework |
| mnemonica | 1.2.x | Instance inheritance / dataflow |
| tactica | 0.1.x | Type generation from `define()` calls |
| TypeScript | 5.x+ | Type safety (strict mode) |
| Pino | 9.x | Structured logging |
| Vitest | 4.x | Testing |
| elFinder | 2.1 | File manager (frontend + node backend) |
| ACE Editor | - | Template editor in admin panel |

## Verification Checklist

Before claiming any task is complete:

- [ ] `npm run build` passes with zero errors
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm test` passes (60 tests)
- [ ] If types changed: `npm run tactica` regenerated `.tactica/`
- [ ] No `any` keywords added
- [ ] No `as unknown as` casts added
- [ ] Hook logic (if any) is cross-cutting, not in route handlers

## Emergency Commands

```bash
# Clear static cache
rm -rf data/static/*

# Regenerate types
npm run tactica

# Full reset
npm run build && npm run tactica && npm test

# Kill server on port 3000
fuser -k 3000/tcp 2>/dev/null
```

## Contact

- Issues: https://github.com/wentout/Fine-Cut-Engine/issues
- mnemonica docs: https://github.com/wentout/mnemonica
