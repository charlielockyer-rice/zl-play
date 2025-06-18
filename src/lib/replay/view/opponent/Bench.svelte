<script>
	import Slot from './Slot.svelte';
	import { replayState } from '$lib/stores/replayState.js';

	$: bench = $replayState?.opponent?.bench || [];
</script>

<div class="bench-container flex gap-2 justify-center items-end h-full">
	{#each bench as slot, index (slot.id || `bench_${index}`)}
		<Slot {slot} />
	{/each}
	
	<!-- Show empty bench slots -->
	{#each Array(5 - bench.length) as _, i}
		<div class="empty-slot">
			<!-- Empty bench slot -->
		</div>
	{/each}
</div>