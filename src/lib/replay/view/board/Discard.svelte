<script>
   import { cardImage } from '$lib/util/assets.js'
   import Pile from './Pile.svelte'
   import { replayState } from '$lib/stores/replayState.js';

   $: discard = $replayState?.player?.discard || [];
   $: top = discard[discard.length - 1];
</script>

<Pile pile={discard} name="Discard">
   {#if top}
      <img class="card" src="{cardImage(top, 'xs')}" alt={top.name} draggable="false">
   {/if}
</Pile>