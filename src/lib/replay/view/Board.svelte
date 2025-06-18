<script>
   // This component is now a simple layout container for the replay view.
   // All state is derived from the `replayState` store within the child components.

   import { replayState } from '$lib/stores/replayState.js';

   import Hand from './board/Hand.svelte'
   import Deck from './board/Deck.svelte'
   import Prizes from './board/Prizes.svelte'
   import Discard from './board/Discard.svelte'
   import LostZone from './board/LostZone.svelte'
   import Bench from './board/Bench.svelte'
   import Active from './board/Active.svelte'
   import Stadium from './board/Stadium.svelte'
   import Table from './board/Temp.svelte'

   import OppHand from './opponent/Hand.svelte'
   import OppDeck from './opponent/Deck.svelte'
   import OppPrizes from './opponent/Prizes.svelte'
   import OppDiscard from './opponent/Discard.svelte'
   import OppLostZone from './opponent/LostZone.svelte'
   import OppBench from './opponent/Bench.svelte'
   import OppActive from './opponent/Active.svelte'
   import OppStadium from './opponent/Stadium.svelte'
   import OppTable from './opponent/Temp.svelte'

   // All dialogs and interactive elements have been removed as they are not used in replay.

   let player, opponent;
   $: if ($replayState) {
      player = $replayState.player;
      opponent = $replayState.opponent;
   }
</script>

{#if $replayState}
<div class="board-wrapper">
   <div class="game">
      <div class="gameboard">

         <div class="hand2 flip">
            <OppHand />
         </div>

         <div class="prizes2 flip">
            <OppPrizes />
         </div>

         <div class="deck2 flip">
            <OppDeck />
         </div>

         <div class="discard2 flip">
            <OppDiscard />
         </div>

         <div class="lz2 flip">
            <OppLostZone />
         </div>

         <div class="bench2 flip">
            <OppBench />
         </div>

         <div class="play2 flip">
            <OppTable />
         </div>

         <div class="play">
            <Table />
         </div>

         <div class="stadium2 flip">
            <OppStadium />
         </div>

         <div class="stadium">
            <Stadium />
         </div>

         <div class="active">
            <div class="active2 flip">
               <OppActive />
            </div>
            <div class="active1">
               <Active />
            </div>
         </div>

         <div class="bench">
            <Bench />
         </div>

         <div class="lz">
            <LostZone />
         </div>

         <div class="discard">
            <Discard />
         </div>

         <div class="deck">
            <Deck />
         </div>

         <div class="prizes">
            <Prizes />
         </div>

         <div class="hand">
            <Hand />
         </div>
      </div>
   </div>
</div>
{/if}

<style>
   .board-wrapper {
      height: 100%;
      width: 100%;
      overflow: hidden;
   }

   .game {
      --card-width: 105px;
      --card-height: 145px;
      height: 100%;
      width: 100%;
      max-width: 1400px;
      margin: 0 auto;
      position: relative;
   }

   .game :global(img.card) {
      filter: drop-shadow(1px 1px 2px var(--shadow-color));
   }

   .gameboard {
      display: grid;
      grid-template-columns: 0.8fr 0.8fr 1fr 1.5fr 1fr 0.8fr 0.8fr;
      grid-template-rows: 0.9fr 1fr 1fr 1fr 1fr 0.9fr;
      grid-template-areas:
         "hand2 hand2 hand2 hand2 hand2 hand2 hand2"
         ". discard2 bench2 bench2 bench2 prizes2 prizes2"
         "lz2 deck2 stadium active play prizes2 prizes2"
         "prizes prizes stadium active play deck lz"
         "prizes prizes bench bench bench discard ."
         "hand hand hand hand hand hand hand";
      gap: 0.5rem;
      height: 100%;
      padding: 0.5rem;
      box-sizing: border-box;
   }

   /* https://css-tricks.com/preventing-a-grid-blowout/ */
   .gameboard > div {
      min-width: 0;
   }

   .gameboard > div > :global(div:first-child) {
      @apply w-full h-full;
   }

   .prizes {
      grid-area: prizes;
   }

   .stadium {
      grid-area: stadium;
      z-index: 10;
      pointer-events: none;
   }

   .active {
      grid-area: active;
      display: grid;
      grid-template-rows: 1fr 1fr;
      position: relative;
   }

   .active1 {
      grid-row: 2;
      grid-column: 1;
   }

   .active2 {
      grid-row: 1;
      grid-column: 1;
   }

   .active:before {
      content: ' ';
      display: block;
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      opacity: 0.5;
      background-image: url('/pokeball.svg');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      pointer-events: none;
   }

   .active > div > :global(div:first-child) {
      @apply w-full h-full;
   }

   .bench {
      grid-area: bench;
   }

   .lz {
      grid-area: lz;
   }

   .deck {
      grid-area: deck;
   }

   .discard {
      grid-area: discard;
   }

   .hand {
      grid-area: hand;
      border-top: 2px solid var(--text-color);
   }

   .play {
      grid-area: play;
      z-index: 11;
   }

   .prizes2 {
      grid-area: prizes2;
   }

   .bench2 {
      grid-area: bench2;
   }

   .lz2 {
      grid-area: lz2;
   }

   .deck2 {
      grid-area: deck2;
   }

   .discard2 {
      grid-area: discard2;
   }

   .hand2 {
      grid-area: hand2;
      border-top: 2px solid var(--text-color);
   }

   .play2 {
      grid-area: play;
   }

   .stadium2 {
      grid-area: stadium;
   }

   .flip {
      transform: scale(-1, -1);
   }

   .flip :global(img.card) {
      filter: drop-shadow(-1px -1px 2px var(--shadow-color));
   }
</style>