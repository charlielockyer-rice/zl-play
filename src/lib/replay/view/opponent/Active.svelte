<script>
	import Slot from './Slot.svelte';
	import { replayState } from '$lib/stores/replayState.js';

	$: active = $replayState?.opponent?.active || null;
</script>

<div class="active-container">
	{#if active}
		<Slot slot={active} />
	{:else}
		<div class="empty-active">
			<!-- Empty active slot -->
		</div>
	{/if}
</div>

<style>
	.active-container {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 100%;
		height: 100%;
	}
</style>