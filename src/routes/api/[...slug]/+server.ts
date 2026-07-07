import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { DIRECTUS_SERVER } from '$env/static/private';
import { env } from '$env/dynamic/private';

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
    'host'
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

const proxyRequest: RequestHandler = async (event) => {
    if (!isCsrfSafe(event)) {
        error(403, 'Cross-site request rejected');
    }

    if (!isPathAllowed(event.params.slug)) {
        error(403, 'Path not allowed');
    }

    const url = `${DIRECTUS_SERVER}/${event.params.slug}${event.url.search}`;

    const proxiedResponse = await event.fetch(url, {
        method: event.request.method,
        headers: filterRequestHeaders(event.request.headers),
        body:
            event.request.method !== 'GET' && event.request.method !== 'HEAD'
                ? await event.request.text()
                : undefined,
        redirect: 'manual'
    });

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