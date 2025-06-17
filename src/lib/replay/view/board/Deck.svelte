<script>
   import Pile from './Pile.svelte'
   import cardback from '$lib/assets/cardback_int.png'
   import { replayState } from '$lib/stores/replayState.js';

   $: deck = $replayState?.player?.deck || [];
</script>

<Pile pile={deck} name="Deck">
   {#if deck.length > 0}
      <img class="card" src={cardback} alt="Deck" draggable="false">
   {/if}
</Pile>