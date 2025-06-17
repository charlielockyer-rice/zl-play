<script>
   import { replayState } from '$lib/stores/replayState.js';
   import Slot from './Slot.svelte'

   $: active = $replayState?.player?.active
</script>

<div>
   <div class="h-full flex justify-center items-center">
      {#if active}
         <Slot slot={active} />
      {/if}
   </div>
</div>