# SvelteKit Cookie Passthrough Demo

A minimal SvelteKit app that demonstrates how to use **Directus session authentication** when your frontend and Directus instance live on **different domains**.

For example:

- SvelteKit app: `https://myapp.com` (or `http://localhost:5173` in development)
- Directus API: `https://your-instance.directus.app`

Browsers will not send cookies set for `your-instance.directus.app` to `myapp.com`, and vice versa. Directus session auth relies on an HTTP-only session cookie (`directus_session_token`), so a naive cross-origin setup breaks login.

This demo solves that by keeping the session cookie on the **SvelteKit domain** and relaying it to Directus on the server.

## The idea

All communication with Directus happens server-side. The browser only talks to SvelteKit.

1. The browser stores the session cookie for the SvelteKit origin.
2. On each server request, SvelteKit forwards that cookie to Directus.
3. When Directus returns `Set-Cookie`, SvelteKit re-issues it for its own domain (without Directus's `Domain` attribute).
4. The browser never sees Directus's original `Set-Cookie` headers.

```
Browser                    SvelteKit server              Directus
   |                              |                         |
   |-- POST /login -------------->|                         |
   |                              |-- POST /auth/login ---->|
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

### 1. `handleFetch` — cookie relay for server-side requests

[`src/hooks.server.ts`](src/hooks.server.ts) exports a `handleFetch` hook that intercepts every `event.fetch` call made during a request (in load functions, form actions, API routes, etc.).

**Outgoing requests to Directus**

When the fetch URL starts with `DIRECTUS_SERVER`, the hook attaches the incoming request's `Cookie` header so Directus receives the session token the browser sent to SvelteKit.

**Incoming responses from Directus**

When Directus responds with `Set-Cookie`:

1. Each cookie is parsed and the `Domain` attribute is removed.
2. The cookie is re-set via `event.cookies.set()`, which issues it for the SvelteKit host.
3. The original `Set-Cookie` headers are stripped from the fetch response so they are not forwarded to the browser with Directus's domain.

This is the core of the pattern. Any server code that uses `event.fetch` to call Directus automatically gets cookie passthrough.

### 2. Directus SDK — session auth via `event.fetch`

[`src/lib/server/directus.ts`](src/lib/server/directus.ts) creates a Directus client configured with:

- `authentication('session')` — uses cookie-based sessions instead of static tokens
- `globals.fetch` set to `getRequestEvent().fetch` — routes all SDK requests through SvelteKit's fetch, which triggers `handleFetch`

Server code never manages tokens manually. Login, logout, and API calls all flow through the same cookie relay.

```ts
const directus = createDirectus(DIRECTUS_SERVER, {
  globals: { fetch: getRequestEvent().fetch }
})
  .with(authentication('session'))
  .with(rest());
```

### 3. Login form — server-side authentication

[`src/routes/login/login.remote.ts`](src/routes/login/login.remote.ts) uses a SvelteKit remote `form` to call `directus.login()`. Directus returns a session cookie in the response; `handleFetch` forwards it to the browser under the SvelteKit domain. The user is then redirected to `/`.

### 4. API proxy — client-side requests through SvelteKit

[`src/routes/api/[...slug]/+server.ts`](src/routes/api/[...slug]/+server.ts) proxies `/api/*` to Directus. This lets the browser call Directus endpoints (e.g. `GET /api/users/me`) without cross-origin requests.

The proxy:

- Uses `event.fetch` so cookies are forwarded and re-set via `handleFetch`
- Strips hop-by-hop headers, `content-encoding`, `content-length`, and `set-cookie` from the proxied response
- Avoids `ERR_CONTENT_DECODING_FAILED` by not forwarding compressed response metadata after Node's fetch has already decompressed the body

The home page includes a small **API Proxy Tester** UI for trying different paths, methods, and JSON bodies against `/api/*`.

## Project structure

```
src/
├── hooks.server.ts              # handleFetch cookie relay
├── lib/
│   ├── server/directus.ts       # Directus SDK client (session auth)
│   └── remotes/directus.remote.ts
├── routes/
│   ├── +page.svelte             # API proxy tester
│   ├── login/
│   │   ├── +page.svelte         # Login form
│   │   └── login.remote.ts      # Server-side login action
│   └── api/[...slug]/+server.ts # Directus API proxy
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

4. Open `http://localhost:5173/login`, sign in with a Directus user, then use the API tester on `/` to call authenticated endpoints like `users/me`.

## Things to be aware of

**`Secure` cookies in development.** Directus may set `Secure` on session cookies. Browsers will not store them over plain `http://localhost`. Use HTTPS locally, or adjust cookie options in development.

**Cookie attributes.** This demo forwards `path`, `httpOnly`, `secure`, `sameSite`, `maxAge`, and `expires` from Directus. It deliberately does not forward `domain`.

**Not a production reverse proxy.** The `/api` catch-all is a demo convenience. In production you may want stricter header filtering, path allowlists, rate limiting, and logging.

**CORS is not the answer here.** CORS controls whether a browser *reads* a cross-origin response. It does not make cookies cross domains. Server-side relay is the reliable approach for session cookies.

## Scripts

| Command        | Description                |
| -------------- | -------------------------- |
| `bun run dev`  | Start development server   |
| `bun run build`| Production build           |
| `bun run check`| Type-check with svelte-check |
| `bun run lint` | Lint and format check      |
