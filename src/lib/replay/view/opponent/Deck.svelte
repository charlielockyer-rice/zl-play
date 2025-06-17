<script>
   import Pile from './Pile.svelte'
   import cardback from '$lib/assets/cardback_tpc.png'
   import { replayState } from '$lib/stores/replayState.js';

   $: deck = $replayState?.opponent?.deck || [];
</script>

<Pile pile={deck} name="Deck">
   {#if deck.length > 0}
      <img class="card" src={cardback} alt="Opponent's Deck" draggable="false">
   {/if}
</Pile>