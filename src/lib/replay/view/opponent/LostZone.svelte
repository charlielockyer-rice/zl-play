<script>
   import { cardImage } from '$lib/util/assets.js'
   import Pile from './Pile.svelte'
   import { replayState } from '$lib/stores/replayState.js';

   $: lz = $replayState?.opponent?.lostzone || [];
   $: top = lz[lz.length - 1];
</script>

<Pile pile={lz} name="Lost Zone">
   {#if top}
      <img class="card" src="{cardImage(top, 'xs')}" alt={top.name} draggable="false">
   {/if}
</Pile>