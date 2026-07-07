import { z } from "zod";
import { form } from '$app/server';
import { getDirectus } from "$lib/server/directus";
import { redirect } from "@sveltejs/kit";

const loginSchema = z.object({
    email: z.email(),
    password: z.string(),
});
export const loginForm = form(loginSchema, async ({ email, password }) => {

    const directus = getDirectus();

    // Should return a cookie, and the fetch event hook will forward it to the client
    await directus.login({ email, password })
    redirect(302, '/');
})