import { DIRECTUS_SERVER } from '$env/static/private';
import type { HandleFetch, RequestEvent } from '@sveltejs/kit';
import { parse } from 'set-cookie-parser';

// Only cookies whose name starts with this prefix are relayed to Directus.
// Prevents unrelated first-party cookies (analytics, CSRF tokens, feature
// flags, etc.) from leaking to the Directus server on every request.
const DIRECTUS_COOKIE_PREFIX = 'directus_';

// Parsed once. `origin` normalises host + port + scheme so we can compare
// exactly instead of using a fragile `startsWith` prefix match (which would
// also match look-alike hosts like `https://<server>.evil.com`).
const DIRECTUS_ORIGIN = new URL(DIRECTUS_SERVER).origin;

const isDirectusRequest = (url: string): boolean => {
    try {
        return new URL(url).origin === DIRECTUS_ORIGIN;
    } catch {
        return false;
    }
};

const rewriteSetCookie = (setCookie: string): string => {
    return setCookie.replace(/;\s*Domain=[^;]*/gi, '');
}

const getSetCookies = (headers: Headers): string[] => {
    if (typeof headers.getSetCookie === 'function') {
        return headers.getSetCookie();
    }

    const raw = headers.get('set-cookie');
    return raw ? [raw] : [];
}

// Forward only the Directus-owned cookies from the incoming request, rather
// than the entire `Cookie` header, so first-party app cookies stay first-party.
const buildDirectusCookieHeader = (event: RequestEvent): string | null => {
    const relayed = event.cookies
        .getAll()
        .filter((cookie) => cookie.name.startsWith(DIRECTUS_COOKIE_PREFIX))
        .map((cookie) => `${cookie.name}=${cookie.value}`);

    return relayed.length > 0 ? relayed.join('; ') : null;
};

export function forwardDirectusSetCookies(event: RequestEvent, headers: Headers): void {
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
}

export const handleFetch: HandleFetch = async ({ event, fetch, request }) => {
    const directusRequest = isDirectusRequest(request.url);

    // Manually attach the Directus session cookie(s) if this is a Directus request
    if (directusRequest) {
        const cookieHeader = buildDirectusCookieHeader(event);
        if (cookieHeader) {
            request.headers.set('cookie', cookieHeader);
        } else {
            request.headers.delete('cookie');
        }
    }

    const response = await fetch(request);

    if (directusRequest) {
        forwardDirectusSetCookies(event, response.headers);

        const headers = new Headers(response.headers);
        headers.delete('set-cookie');

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers
        });
    }

    return response;
};