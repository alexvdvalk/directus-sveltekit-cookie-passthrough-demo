import { getRequestEvent } from '$app/server';
import { DIRECTUS_SERVER } from '$env/static/private';
import { createDirectus, authentication, rest } from '@directus/sdk';
export const getDirectus = () => {
    const { fetch } = getRequestEvent();
    const directus = createDirectus(DIRECTUS_SERVER, {
        globals: {
            fetch
        }
    })
        .with(authentication("session"))
        .with(rest())
    return directus;
}