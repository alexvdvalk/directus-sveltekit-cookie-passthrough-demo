<script lang="ts">
	import { redirectUserFromLoginScreenIfAlreadyLoggedIn } from '$lib/remotes/directus.remote';
	import { loginForm } from './login.remote';

	await redirectUserFromLoginScreenIfAlreadyLoggedIn();
</script>

<div class="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
	<div class="w-full max-w-sm">
		<div class="mb-8 text-center">
			<h1 class="text-2xl font-semibold tracking-tight text-zinc-900">Welcome back</h1>
			<p class="mt-2 text-sm text-zinc-500">Sign in to your account to continue</p>
		</div>

		<form class="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm" {...loginForm}>
			<div class="space-y-5">
				<div>
					<label for="email" class="mb-1.5 block text-sm font-medium text-zinc-700"> Email </label>
					<input
						{...loginForm.fields.email.as('text')}
						class="block w-full rounded-lg border-zinc-300 text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-zinc-500"
					/>
				</div>

				<div>
					<label for="password" class="mb-1.5 block text-sm font-medium text-zinc-700">
						Password
					</label>
					<input
						{...loginForm.fields.password.as('password')}
						class="block w-full rounded-lg border-zinc-300 text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-zinc-500"
					/>
				</div>
			</div>

			<button
				type="submit"
				class="mt-6 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2"
			>
				Sign in
			</button>
		</form>
	</div>
</div>
