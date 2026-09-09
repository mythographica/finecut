# FineCut BFF

Backend-for-Frontend static file server + proxy.

## What it does

- Serves `public/` (CSS, JS, images)
- Serves `admin/panel/` (admin panel static files)
- Serves `data/static/` (pre-generated page HTML)
- Proxies everything else to the backend

## Config

```bash
STATIC_ROOT=/var/finecut/static    # default: ./data/static
BACKEND_URL=http://localhost:3003  # default: http://localhost:3003
PORT=3002                          # default: 3002
```

## Start

```bash
npm install
npm start
```

## Request flow

```
GET /                    → data/static/_index/index.html
GET /about               → data/static/about/index.html (or proxy)
GET /public/style.css    → public/style.css
GET /admin/panel/        → admin/panel/index.html
GET /engine/tree         → proxy to BACKEND_URL/engine/tree
```
