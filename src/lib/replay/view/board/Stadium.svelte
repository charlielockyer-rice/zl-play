<script>
   import Card from './Card.svelte'
   import { replayState } from '$lib/stores/replayState.js';

   $: stadium = $replayState?.player?.stadium;
</script>

<div class="p-1 flex justify-center items-center">
   {#if stadium}
      <Card card={stadium} />
   {/if}
</div>