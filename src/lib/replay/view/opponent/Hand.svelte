<script>
   import Horizontal from '$lib/components/scroll/Horizontal.svelte'
   import Card from './Card.svelte'
   import { replayState } from '$lib/stores/replayState.js';

   $: hand = $replayState?.opponent?.hand || [];
</script>

<div class="hand-container">
   <Horizontal>
      <div class="flex gap-2 p-2 m-auto w-max">
         {#each hand as card, index (card.id || card._id || index)}
            <Card {card} />
         {/each}
      </div>
   </Horizontal>
</div>

<style>
   .hand-container {
      height: 100%;
      overflow: hidden; /* Prevent cards from extending beyond grid area */
      display: flex;
      align-items: center; /* Center cards vertically within the hand area */
      justify-content: center; /* Center the horizontal scroll container */
      padding: 0.5rem 0; /* Add vertical padding for separation from edges */
   }
</style>