import { DIRECTUS_SERVER } from '$env/static/private';
import type { HandleFetch, RequestEvent } from '@sveltejs/kit';
import { parse } from 'set-cookie-parser';



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

export function forwardDirectusSetCookies(event: RequestEvent, headers: Headers): void {
    for (const raw of getSetCookies(headers)) {
        const cookies = parse(rewriteSetCookie(raw), { map: false });

        for (const cookie of cookies) {
            event.cookies.set(cookie.name, cookie.value, {
                path: cookie.path ?? '/',
                httpOnly: cookie.httpOnly ?? true,
                secure: cookie.secure ?? true,
                sameSite: (cookie.sameSite?.toLowerCase() as 'lax' | 'strict' | 'none') ?? 'lax',
                maxAge: cookie.maxAge,
                expires: cookie.expires
            });
        }
    }
}

export const handleFetch: HandleFetch = async ({ event, fetch, request }) => {
    const cookieHeader = event.request.headers.get('cookie');

    // Manually attach the cookie header to the request if it is a directus request
    if (request.url.startsWith(DIRECTUS_SERVER) && cookieHeader) {
        request.headers.set('cookie', cookieHeader);
    }

    const response = await fetch(request);

    if (request.url.startsWith(DIRECTUS_SERVER)) {
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