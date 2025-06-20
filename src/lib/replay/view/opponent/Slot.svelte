<script>
   import { cardImage } from '$lib/util/assets.js';
   // Note: All interactive logic and old stores removed.
   // This component now takes a plain JS object for the slot.

   export let slot;

   // Provide default empty arrays to prevent crashes on undefined properties
   $: pokemon = slot?.pokemon || [];
   $: trainer = slot?.trainer || [];
   $: energy = slot?.energy || [];
   $: damage = slot?.damage || 0;
   $: marker = slot?.marker || false;

   $: top = pokemon[pokemon.length - 1];
</script>

<div class="slot relative w-max z-15" style="margin-right: calc({energy.length * 25 + trainer.length * 35}px * var(--card-scale))">

   {#if damage}
      <span class="counter absolute bottom-1 left-1 z-15 rounded-full p-4 bg-red-500 text-white font-bold flex justify-center items-center">{damage}</span>
   {/if}

   {#if marker}
      <span class="counter absolute top-1 right-1 z-15 rounded-full p-4 bg-yellow-500 text-white font-bold flex justify-center items-center"></span>
   {/if}

   {#if top}
      <img
         src="{cardImage(top, 'xs')}"
         alt="{top.name}"
         class="card pokemon relative z-10" draggable="false">
   {/if}

   {#each energy as nrg, i (nrg.id || nrg._id || `energy_${i}`)}
      <img src="{cardImage(nrg, 'xs')}" alt="{nrg.name}" class="card absolute" draggable="false"
         style="bottom: 0; left: calc({(i + 1)* 25}px * var(--card-scale)); z-index: {9 - i}">
   {/each}

   {#each trainer as tool, i (tool.id || tool._id || `trainer_${i}`)}
      <img src="{cardImage(tool, 'xs')}" alt="{tool.name}" class="card absolute" draggable="false"
         style="bottom: 0; left: calc({energy.length * 25 + (i + 1) * 35}px * var(--card-scale)); z-index: {9 - i - energy.length}">
   {/each}
</div>

<style>
   img.card {
      @apply box-content border-2 border-transparent rounded-md;
   }

   .counter {
      width: calc(var(--card-width) * var(--card-scale) / 2.5);
      height: calc(var(--card-width) * var(--card-scale) / 2.5);
      transform: scale(-1, -1);
   }
</style>