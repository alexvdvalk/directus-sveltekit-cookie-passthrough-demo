import { query } from '$app/server';
import { readMe } from '@directus/sdk';
import { redirect } from '@sveltejs/kit';
import { getDirectus } from '../server/directus';

export const getMeFromDirectus = query(async () => {
    const directus = getDirectus();
    return await directus.request(readMe());
});

export const redirectToLoginIfNotLoggedIn = query(async () => {
    try {
        return await getMeFromDirectus();
    } catch {
        redirect(302, '/login');
    }
});

export const redirectUserFromLoginScreenIfAlreadyLoggedIn = query(async () => {
    const me = await getMeFromDirectus().catch(() => null);
    if (me) {
        redirect(302, '/');
    }
});