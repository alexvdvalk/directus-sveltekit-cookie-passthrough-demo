# SvelteKit Cookie Passthrough Demo

A minimal SvelteKit app that demonstrates how to use **Directus session authentication** when your frontend and Directus instance live on **different domains**.

For example:

- SvelteKit app: `https://myapp.com` (or `http://localhost:5173` in development)
- Directus API: `https://your-instance.directus.app`

Browsers will not send cookies set for `your-instance.directus.app` to `myapp.com`, and vice versa. Directus session auth relies on an HTTP-only session cookie (`directus_session_token`), so a naive cross-origin setup breaks login.

This demo solves that by keeping the session cookie on the **SvelteKit domain** and relaying it to Directus through a same-origin `/api` proxy.

## The idea

All communication with Directus goes through SvelteKit's `/api/*` proxy. The browser only talks to SvelteKit.

1. The browser stores the session cookie for the SvelteKit origin.
2. `/api/*` forwards `directus_*` cookies to Directus on the server.
3. When Directus returns `Set-Cookie`, the proxy re-issues it for the SvelteKit domain (without Directus's `Domain` attribute).
4. The browser never sees Directus's original `Set-Cookie` headers.

```
Browser                    SvelteKit /api proxy          Directus
   |                              |                         |
   |-- POST /login -------------->|                         |
   |   (SDK → /api/auth/login)    |-- POST /auth/login ---->|
   |                              |<-- Set-Cookie (Directus)|
   |                              |   (stripped & re-set)   |
   |<-- Set-Cookie (SvelteKit) ---|                         |
   |                              |                         |
   |-- GET /api/users/me -------->|                         |
   |   Cookie: directus_session   |-- GET /users/me ------->|
   |                              |   Cookie: forwarded     |
   |<-- JSON response ------------|<-- JSON response --------|
```

## How it works

### 1. API proxy — cookie relay

[`src/routes/api/[...slug]/+server.ts`](src/routes/api/[...slug]/+server.ts) proxies `/api/*` to Directus and owns all cookie passthrough logic:

**Outgoing requests to Directus**

- Builds a `Cookie` header from cookies whose names start with `directus_`
- Strips hop-by-hop headers (including the browser's full `Cookie` header) so unrelated first-party cookies are not leaked
- Uses global `fetch` to call Directus directly

**Incoming responses from Directus**

1. Each `Set-Cookie` is parsed and the `Domain` attribute is removed.
2. The cookie is re-set via `event.cookies.set()` for the SvelteKit host with `SameSite=Lax`.
3. Upstream `set-cookie`, `content-encoding`, and `content-length` are stripped from the proxied response.

The proxy also includes optional path allowlisting (`DIRECTUS_PROXY_ALLOWLIST`) and CSRF checks for state-changing methods.

### 2. Directus SDK — session auth via the local proxy

[`src/lib/server/directus.ts`](src/lib/server/directus.ts) creates a Directus client pointed at this app's `/api` base URL:

- `authentication('session')` — uses cookie-based sessions instead of static tokens
- `globals.fetch` set to `getRequestEvent().fetch` — routes SDK requests through SvelteKit into `/api/*`, where cookies are relayed

Server code never manages tokens manually. Login, logout, and API calls all flow through the same proxy.

```ts
const event = getRequestEvent();
const directus = createDirectus(`${event.url.origin}/api`, {
  globals: { fetch: event.fetch }
})
  .with(authentication('session'))
  .with(rest());
```

### 3. Login form — server-side authentication

[`src/routes/login/login.remote.ts`](src/routes/login/login.remote.ts) uses a SvelteKit remote `form` to call `directus.login()`. That hits `/api/auth/login`, which proxies to Directus and re-issues the session cookie on the SvelteKit domain. The user is then redirected to `/`.

### 4. Home page — Directus client tester

The home page exercises authenticated Directus calls through a remote `command` that uses the same SDK client (and therefore the same `/api` cookie relay).

## Project structure

```
src/
├── lib/
│   ├── server/directus.ts       # Directus SDK client (points at /api)
│   └── remotes/directus.remote.ts
├── routes/
│   ├── +page.svelte             # Directus client tester
│   ├── login/
│   │   ├── +page.svelte         # Login form
│   │   └── login.remote.ts      # Server-side login action
│   └── api/[...slug]/+server.ts # Directus proxy + cookie relay
```

## Setup

1. Clone the repo and install dependencies:

   ```sh
   bun install
   ```

2. Create a `.env` file with your Directus instance URL:

   ```
   DIRECTUS_SERVER=https://your-instance.directus.app
   ```

3. Start the dev server:

   ```sh
   bun run dev
   ```

4. Open `http://localhost:5173/login`, sign in with a Directus user, then use the tester on `/` to call authenticated endpoints like `users/me`.

## Things to be aware of

**`Secure` cookies in development.** Directus may set `Secure` on session cookies. Browsers will not store them over plain `http://localhost`. Use HTTPS locally, or adjust cookie options in development.

**Cookie attributes.** This demo forwards `path`, `httpOnly`, `secure`, `maxAge`, and `expires` from Directus. It forces `sameSite: 'lax'` and deliberately does not forward `domain`.

**Not a production reverse proxy.** The `/api` catch-all is a demo convenience. In production you should set `DIRECTUS_PROXY_ALLOWLIST`, and consider rate limiting and logging.

**CORS is not the answer here.** CORS controls whether a browser *reads* a cross-origin response. It does not make cookies cross domains. Server-side relay is the reliable approach for session cookies.

## Scripts

| Command         | Description                  |
| --------------- | ---------------------------- |
| `bun run dev`   | Start development server     |
| `bun run build` | Production build             |
| `bun run check` | Type-check with svelte-check |
| `bun run lint`  | Lint and format check        |
