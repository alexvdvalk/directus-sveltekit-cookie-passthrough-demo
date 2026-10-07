import type { RequestHandler } from './$types';
import { error, type RequestEvent } from '@sveltejs/kit';
import { DIRECTUS_SERVER } from '$env/static/private';
import { env } from '$env/dynamic/private';
import { parse } from 'set-cookie-parser';

// Only cookies whose name starts with this prefix are relayed to Directus.
// Prevents unrelated first-party cookies (analytics, CSRF tokens, feature
// flags, etc.) from leaking to the Directus server on every request.
const DIRECTUS_COOKIE_PREFIX = 'directus_';

// Optional, opt-in path allowlist. Comma-separated list of path prefixes
// (relative to the Directus root, no leading slash), e.g.
//   DIRECTUS_PROXY_ALLOWLIST=items/,users/me,files
// When unset the proxy allows every path — convenient for the demo's API
// tester, but you should set an allowlist in production to shrink the blast
// radius of the authenticated proxy.
const PROXY_ALLOWLIST = (env.DIRECTUS_PROXY_ALLOWLIST ?? '')
	.split(',')
	.map((entry) => entry.trim())
	.filter(Boolean);

const isPathAllowed = (slug: string): boolean => {
	if (PROXY_ALLOWLIST.length === 0) {
		return true;
	}
	return PROXY_ALLOWLIST.some((prefix) => slug === prefix || slug.startsWith(prefix));
};

// Methods that can change server state and therefore need CSRF protection.
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Reject cross-site state-changing requests. The session cookie is now a
// first-party SvelteKit cookie, so legitimate calls from this app always carry
// an Origin matching our own. A mismatched (or, for state-changing methods,
// absent) Origin means the request did not originate from this app.
const isCsrfSafe = (event: Parameters<RequestHandler>[0]): boolean => {
	if (!STATE_CHANGING_METHODS.has(event.request.method)) {
		return true;
	}
	const origin = event.request.headers.get('origin');
	return origin !== null && origin === event.url.origin;
};

const HOP_BY_HOP_HEADERS = new Set([
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailers',
	'transfer-encoding',
	'upgrade',
	'host',
	'cookie'
]);

const filterRequestHeaders = (headers: Headers): Headers => {
	const filtered = new Headers();

	for (const [name, value] of headers) {
		if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
			filtered.set(name, value);
		}
	}

	return filtered;
};

const filterResponseHeaders = (headers: Headers): Headers => {
	const filtered = new Headers();

	for (const [name, value] of headers) {
		const lower = name.toLowerCase();
		if (
			HOP_BY_HOP_HEADERS.has(lower) ||
			lower === 'content-encoding' ||
			lower === 'content-length' ||
			lower === 'set-cookie'
		) {
			continue;
		}

		filtered.set(name, value);
	}

	return filtered;
};

const rewriteSetCookie = (setCookie: string): string => {
	return setCookie.replace(/;\s*Domain=[^;]*/gi, '');
};

const getSetCookies = (headers: Headers): string[] => {
	if (typeof headers.getSetCookie === 'function') {
		return headers.getSetCookie();
	}

	const raw = headers.get('set-cookie');
	return raw ? [raw] : [];
};

// Forward only the Directus-owned cookies from the incoming request, rather
// than the entire `Cookie` header, so first-party app cookies stay first-party.
const buildDirectusCookieHeader = (event: RequestEvent): string | null => {
	const relayed = event.cookies
		.getAll()
		.filter((cookie) => cookie.name.startsWith(DIRECTUS_COOKIE_PREFIX))
		.map((cookie) => `${cookie.name}=${cookie.value}`);

	return relayed.length > 0 ? relayed.join('; ') : null;
};

const forwardDirectusSetCookies = (event: RequestEvent, headers: Headers): void => {
	for (const raw of getSetCookies(headers)) {
		const cookies = parse(rewriteSetCookie(raw), { map: false });

		for (const cookie of cookies) {
			// The cookie now lives on the SvelteKit origin, so it never needs
			// to be sent cross-site. Force SameSite=Lax regardless of what
			// Directus asked for (Directus commonly issues SameSite=None for
			// cross-domain setups, which would leave the /api proxy fully
			// exposed to CSRF). Lax keeps normal top-level navigation working.
			event.cookies.set(cookie.name, cookie.value, {
				path: cookie.path ?? '/',
				httpOnly: cookie.httpOnly ?? true,
				secure: cookie.secure ?? true,
				sameSite: 'lax',
				maxAge: cookie.maxAge,
				expires: cookie.expires
			});
		}
	}
};

const proxyRequest: RequestHandler = async (event) => {
	if (!isCsrfSafe(event)) {
		error(403, 'Cross-site request rejected');
	}

	if (!isPathAllowed(event.params.slug)) {
		error(403, 'Path not allowed');
	}

	const url = `${DIRECTUS_SERVER}/${event.params.slug}${event.url.search}`;
	const headers = filterRequestHeaders(event.request.headers);

	const cookieHeader = buildDirectusCookieHeader(event);
	if (cookieHeader) {
		headers.set('cookie', cookieHeader);
	}

	// Use global fetch (not event.fetch) so cookie relay stays local to this
	// route and does not depend on a handleFetch hook.
	const proxiedResponse = await fetch(url, {
		method: event.request.method,
		headers,
		body:
			event.request.method !== 'GET' && event.request.method !== 'HEAD'
				? await event.request.text()
				: undefined,
		redirect: 'manual'
	});

	forwardDirectusSetCookies(event, proxiedResponse.headers);

	return new Response(proxiedResponse.body, {
		status: proxiedResponse.status,
		statusText: proxiedResponse.statusText,
		headers: filterResponseHeaders(proxiedResponse.headers)
	});
};

export const GET: RequestHandler = proxyRequest;
export const POST: RequestHandler = proxyRequest;
export const PUT: RequestHandler = proxyRequest;
export const DELETE: RequestHandler = proxyRequest;
export const PATCH: RequestHandler = proxyRequest;
export const OPTIONS: RequestHandler = proxyRequest;
export const HEAD: RequestHandler = proxyRequest;
