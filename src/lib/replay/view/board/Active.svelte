<script>
	import Slot from './Slot.svelte';
	import { replayState } from '$lib/stores/replayState.js';

	$: active = $replayState?.player?.active || null;
</script>

{#if active}
	<Slot slot={active} />
{:else}
	<div class="empty-active">
		<!-- Empty active slot -->
	</div>
{/if}