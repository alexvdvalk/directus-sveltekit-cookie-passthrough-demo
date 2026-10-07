import { getRequestEvent } from '$app/server';
import { createDirectus, authentication, rest } from '@directus/sdk';

// Point the SDK at this app's /api proxy so session cookies are relayed there
// instead of via a global handleFetch hook.
export const getDirectus = () => {
	const event = getRequestEvent();
	const directus = createDirectus(`${event.url.origin}/api`, {
		globals: {
			fetch: event.fetch
		}
	})
		.with(authentication('session'))
		.with(rest());
	return directus;
};
