<script>
   import Slot from './Slot.svelte'
   import { replayState } from '$lib/stores/replayState.js';

   $: bench = $replayState?.opponent?.bench || [];
</script>

<div class="p-1 flex items-center focus:outline-none">
   <div class="p-1 flex gap-[var(--scaled-rem)] min-w-0">
      {#each bench as slot (slot.id)}
         <Slot {slot} />
      {/each}
   </div>
</div>