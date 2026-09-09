
FineCut CMS — Node.js Edition
==============================

A lightweight, file-based CMS with no database. Originally written in PHP
16 years ago, now rebuilt on Node.js + Fastify + TypeScript + mnemonica.

Architecture
------------

Every HTTP request flows through a mnemonica prototype chain:

    RequestData → RouteData → PageData → RenderData → ResponseData

Each step enriches the request context. Hooks provide cross-cutting
observability (logging, caching, validation, metrics) with zero business
logic in route handlers.

Directory Structure
-------------------

    bin/         CLI utilities (cache clear, etc.)
    core/        Server bootstrap, settings, mnemonica collections
    data/        Pages, menus, settings, static cache
    lib/         File utils, template engine, components
    log/         Pino log output
    plugins/     Pino logger, static cache
    public/      Static assets (stylesheets, javascripts, files/)
    routes/      Frontend catch-all, engine API routes
    test/        Unit and integration tests (Vitest)
    views/       Template engine + template directories

Page Storage
------------

Each page is a directory under data/pages/ containing:

    header.txt   JSON metadata (title, template, keywords, ...)
    content.txt  Page body
    info.txt     Additional metadata
    blocks.txt   JSON array of named blocks

Admin Panel
-----------

Available at /admin:

    Pages Manager    Tree CRUD, content/settings/blocks editor
    Templates        Template CRUD with ACE editor
    File Manager     elFinder 2.1 integration
    Settings         Cache clear, engine config

Development
-----------

    npm install          Install dependencies
    npm run build        Compile TypeScript
    npm run dev          Start with Node.js --watch
    npm start            Production start
    npm test             Run Vitest suite
    npm run tactica      Regenerate .tactica/ types

Requirements
------------

    Node.js 20+ (LTS recommended)
    Modern browser for admin panel

License
-------

MIT or GPL. See /about/license/ for details.
