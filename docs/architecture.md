# Architecture

## Overview

The system is a TypeScript monorepo managed with pnpm workspaces. It has two
applications and one shared package:

```
            browser
               │
      ┌────────▼────────┐        /api/*        ┌─────────────────┐
      │    apps/web     │ ───────────────────▶ │    apps/api     │ ──▶ PostgreSQL
      │  React + Vite   │ ◀─────────────────── │ Express + Zod   │
      └────────┬────────┘      JSON             └────────┬────────┘
               │                                         │
               └──────────────┐          ┌───────────────┘
                              ▼          ▼
                          packages/shared
                     (schemas, types, constants)
```

- **apps/web** is a single-page application. In development, Vite proxies `/api` to the
  API so the browser only talks to one origin.
- **apps/api** exposes a JSON HTTP API. All secrets, including any third-party API keys,
  stay on the server.
- **packages/shared** holds the contract between the two: Zod schemas for request and
  response bodies, plus domain constants such as the supported languages and CEFR levels.
  The API builds its responses from these types and the web app validates what it
  receives against the same schemas.

## API structure

```
apps/api/src/
  config/        environment parsing and app metadata
  lib/           infrastructure helpers (logger, ...)
  http/
    app.ts       composes middleware and routers; no side effects, easy to test
    middleware/  request logging, error handling, 404
  modules/
    <feature>/   routes, controllers, services and data access for one feature
  server.ts      process entry point: loads config, starts listening, handles shutdown
```

Requests flow `route → controller → service → repository`. Routers stay thin; business
rules live in services; database access lives in repositories. `createApp` receives its
dependencies (configuration, logger, later the database client) instead of importing
globals, so tests can build an app with test doubles.

### Configuration

Environment variables are parsed once at startup with a Zod schema
(`config/env.ts`). Invalid or missing values stop the process with a readable message
instead of failing later at runtime.

### Errors

Every error response has the same shape:

```json
{ "error": { "code": "NOT_FOUND", "message": "…", "requestId": "…" } }
```

Expected failures are thrown as `HttpError` with a stable `code` that the client can rely
on. Unknown errors become a generic 500; their details are logged, never returned.

### Logging

Pino writes structured JSON logs (pretty-printed in development). Every request gets an
id, returned in the `x-request-id` header and included in error bodies, so a report from a
user can be matched to a log line. Only the method, URL and status of each request are
logged; authorization headers and cookies are redacted.

## Security baseline

- Helmet sets secure HTTP headers, including a Content Security Policy.
- CORS allows only the configured web origin.
- JSON bodies are limited to 100 kB.
- Incoming request ids are accepted only if they match a strict pattern, to avoid log
  injection.
- The local database listens on `127.0.0.1` only and has no default password.

Authentication, authorisation and rate limiting are added with the user accounts feature.

## Testing

- **Unit tests** sit next to the code they cover (`*.test.ts`).
- **API tests** use Supertest against `createApp` without opening a network port.
- **Web tests** use Testing Library with jsdom and stub `fetch` at the boundary.

CI runs formatting, lint, type-check, tests and build on every push and pull request.
