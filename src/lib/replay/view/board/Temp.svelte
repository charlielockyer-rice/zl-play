<script>
   import { cardImage } from '$lib/util/assets.js'
   import { replayState } from '$lib/stores/replayState.js';

   $: table = $replayState?.player?.temp || [];
</script>

<div class="h-full flex justify-center items-center">
   <div class="relative w-max"
      style="margin-bottom: {(table.length - 1) * 35}px; margin-right: {table.length > 1 ? 20 : 0}px">

      {#if table.length > 0}
         <img class="card" src="{cardImage(table[0], 'xs')}" alt={table[0].name} draggable="false">
         {#each table as card, i (card.id || card._id || `temp_${i}`)}
            {#if i >= 1}
               <img class="card absolute" src="{cardImage(card, 'xs')}" alt={card.name} draggable="false"
                  style="bottom: -{i * 35}px; left: {i % 2 !== 0 ? 20 : 0}px">
            {/if}
         {/each}
      {/if}
   </div>
</div>

<style>
   .selected {
      --drop-shadow-color: #fbbf24;
      filter: drop-shadow(0px 0px 10px var(--drop-shadow-color)) !important;
   }
</style>