import type { RequestHandler } from './$types';
import { DIRECTUS_SERVER } from '$env/static/private';

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