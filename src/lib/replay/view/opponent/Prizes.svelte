<script>
   import Vertical from '$lib/components/scroll/Vertical.svelte'
   import Card from './Card.svelte'
   import { replayState } from '$lib/stores/replayState.js';

   $: prizes = $replayState?.opponent?.prizes || [];
</script>

<div class="prizes-container">
   <Vertical>
      <div class="prizes p-1 grid grid-cols-2 gap-1 w-fit">
         {#each prizes as card, index (card.id || card._id || index)}
            <Card {card} revealed={card.revealed} />
         {/each}
      </div>
   </Vertical>
</div>

<style>
   /* Prize cards now inherit responsive sizing from parent container */
</style>