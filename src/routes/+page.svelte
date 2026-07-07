<script lang="ts">
	import { redirectToLoginIfNotLoggedIn } from '$lib/remotes/directus.remote';

	const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

	let path = $state('users/me');
	let method = $state<(typeof methods)[number]>('GET');
	let body = $state('');
	let useBody = $state(false);
	let response = $state<unknown>(null);
	let error = $state<string | null>(null);
	let loading = $state(false);

	const canHaveBody = $derived(method !== 'GET' && method !== 'DELETE');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		loading = true;
		error = null;
		response = null;

		try {
			let parsedBody: string | undefined;

			if (useBody && canHaveBody && body.trim()) {
				try {
					parsedBody = JSON.stringify(JSON.parse(body));
				} catch {
					throw new Error('Body must be valid JSON');
				}
			}

			const res = await fetch(`/api/${path.replace(/^\//, '')}`, {
				method,
				headers: parsedBody ? { 'content-type': 'application/json' } : undefined,
				body: parsedBody
			});

			const text = await res.text();
			try {
				response = JSON.parse(text);
			} catch {
				response = text;
			}

			if (!res.ok) {
				error = `HTTP ${res.status} ${res.statusText}`;
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Request failed';
		} finally {
			loading = false;
		}
	}

	await redirectToLoginIfNotLoggedIn();
</script>

<div class="mx-auto max-w-3xl px-4 py-10">
	<h1 class="mb-2 text-2xl font-semibold tracking-tight text-zinc-900">API Proxy Tester</h1>
	<p class="mb-8 text-sm text-zinc-500">
		Send requests through <code class="text-zinc-700">/api/*</code>
	</p>

	<form
		class="space-y-5 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
		onsubmit={submit}
	>
		<div class="grid gap-5 sm:grid-cols-[8rem_1fr]">
			<div>
				<label for="method" class="mb-1.5 block text-sm font-medium text-zinc-700">Method</label>
				<select
					id="method"
					bind:value={method}
					class="block w-full rounded-lg border-zinc-300 text-zinc-900 shadow-sm focus:border-zinc-500 focus:ring-zinc-500"
				>
					{#each methods as m (m)}
						<option value={m}>{m}</option>
					{/each}
				</select>
			</div>

			<div>
				<label for="path" class="mb-1.5 block text-sm font-medium text-zinc-700">Path</label>
				<div class="flex rounded-lg shadow-sm">
					<span
						class="inline-flex items-center rounded-l-lg border border-r-0 border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-500"
					>
						/api/
					</span>
					<input
						id="path"
						type="text"
						bind:value={path}
						required
						placeholder="users/me"
						class="block w-full rounded-r-lg border-zinc-300 text-zinc-900 focus:border-zinc-500 focus:ring-zinc-500"
					/>
				</div>
			</div>
		</div>

		{#if canHaveBody}
			<label class="flex items-center gap-2 text-sm text-zinc-700">
				<input
					type="checkbox"
					bind:checked={useBody}
					class="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
				/>
				Use body
			</label>
		{/if}

		{#if canHaveBody && useBody}
			<div>
				<label for="body" class="mb-1.5 block text-sm font-medium text-zinc-700">Body (JSON)</label>
				<textarea
					id="body"
					bind:value={body}
					rows="8"
					spellcheck="false"
					class="block w-full rounded-lg border-zinc-300 font-mono text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:ring-zinc-500"
				></textarea>
			</div>
		{/if}

		<button
			type="submit"
			disabled={loading}
			class="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 disabled:opacity-50"
		>
			{loading ? 'Sending…' : 'Send request'}
		</button>
	</form>

	{#if error}
		<p class="mt-6 text-sm text-red-600">{error}</p>
	{/if}

	{#if response !== null}
		<div class="mt-6">
			<h2 class="mb-2 text-sm font-medium text-zinc-700">Response</h2>
			<pre
				class="overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-800">{typeof response ===
				'string'
					? response
					: JSON.stringify(response, null, 2)}</pre>
		</div>
	{/if}
</div>
