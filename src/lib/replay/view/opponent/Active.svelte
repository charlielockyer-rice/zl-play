<script>
   import Slot from './Slot.svelte'
   import { replayState } from '$lib/stores/replayState.js';

   $: active = $replayState?.opponent?.active;
</script>

<div>
   <div class="h-full flex justify-center items-center">
      {#if active}
         <Slot slot={active} />
      {/if}
   </div>
</div>