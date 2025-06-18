<script>
	import { slide } from './slide.js';
	import { importDeck, deckName } from '$lib/stores/player';
	import { get, post } from '$lib/util/fetch-web';
	import { publishLog, share } from '$lib/stores/connection';
	import Spinner from './Spinner.svelte';

	const base = import.meta.env.VITE_LIMITLESS_WEB;

	let isOpen = true;
	let raw = '';
	let response = '';
	let loading = false;
	let loadingRandom = false;

	async function importFromRaw() {
		if (!raw) return;
		loading = true;
		try {
			const res = await post(`${base}/api/dm/import`, { input: raw });
			if (res && res.cards) {
				const count = res.cards.reduce((c, card) => c + card.count, 0);
				if (res.errors && res.errors.length) {
					response = res.errors.join('\\n');
				} else if (count !== 60) {
					response = 'Decklist is not 60 cards!';
				} else {
					importDeck(res.cards, res.name || 'Imported Deck');
					// Note: deckLoaded sharing handled via boardState now
					publishLog('Imported deck');
					response = 'Import successful!';
					isOpen = false;
				}
			}
		} finally {
			loading = false;
		}
	}

	async function random() {
		loadingRandom = true;
		try {
			const res = await get(`${base}/api/dm/random`);
			if (res && res.cards) {
				importDeck(res.cards, res.name || 'Random Deck');
				// Note: deckLoaded sharing handled via boardState now
				publishLog('Got a random deck ⚆ _ ⚆');
				isOpen = false;
			}
		} finally {
			loadingRandom = false;
		}
	}
</script>

{#if isOpen}
	<div
		class="fixed z-20 h-screen w-[50vw] max-w-[750px] min-w-[300px] bg-[var(--bg-color-two)] shadow-lg shadow-dark-400"
		transition:slide={{ axis: 'x' }}
	>
		<div class="flex flex-col h-full">
			<button class="self-start bg-blue-500 !rounded-none !rounded-br-md !p-3" on:click={() => (isOpen = false)}
				>Close</button
			>

			<div class="flex-1 flex flex-col gap-2 p-3 overflow-hidden">
				<textarea class="h-[65vh] rounded-md p-2" bind:value={raw} on:keydown|stopPropagation />
				<button class="bg-[var(--primary-color)] button-with-spinner" on:click={importFromRaw}>
					Import Deck
					{#if loading}
						<Spinner />
					{/if}
				</button>

				<p class="flex-1 min-h-0 whitespace-pre text-lg overflow-y-auto">{response}</p>

				<button class="primary self-start mt-auto button-with-spinner" on:click={random}>
					Import Random Deck
					{#if loadingRandom}
						<Spinner />
					{/if}
				</button>
			</div>
		</div>
	</div>
{:else}
	<button
		class="fixed z-14 top-0 left-0 bg-blue-500 !rounded-none !rounded-br-md !p-3"
		on:click={() => (isOpen = true)}>Edit Deck</button
	>
{/if}

<style>
	button {
		@apply p-2 rounded-md text-white font-bold;
	}

	.button-with-spinner {
		@apply flex gap-4 justify-center items-center;
	}
</style>