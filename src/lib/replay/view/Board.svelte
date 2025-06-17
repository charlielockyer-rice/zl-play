<script>
   // This component is now a simple layout container for the replay view.
   // All state is derived from the `replayState` store within the child components.

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
</script>

<div class="h-screen overflow-y-auto flex-1" on:contextmenu|capture|preventDefault>
   <div class="game flex flex-col h-full max-w-[1920px] m-auto select-none relative">

      <div class="gameboard min-h-0 relative flex-1">

         <!-- Player's zones -->
         <div class="bench">
            <Bench />
         </div>
         <div class="prizes">
            <Prizes />
         </div>
         <div class="deck">
            <Deck />
         </div>
         <div class="discard">
            <Discard />
         </div>
         <div class="lz">
            <LostZone />
         </div>
         <div class="play">
            <Table />
         </div>
         <div class="stadium">
            <Stadium />
         </div>

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

         <div class="stadium2 flip">
            <OppStadium />
         </div>

         <div class="active">
            <div class="active2 flip">
               <OppActive />
            </div>
            <div class="active1">
               <Active />
            </div>
         </div>

         <div class="hand">
            <Hand />
         </div>

         <!-- Opponent's zones -->
         <div class="prizes2">
            <OppPrizes />
         </div>
         <div class="deck2">
            <OppDeck />
         </div>
         <div class="discard2">
            <OppDiscard />
         </div>
         <div class="lz2">
            <OppLostZone />
         </div>
         <div class="bench2">
            <OppBench />
         </div>
         <div class="play2">
            <OppTable />
         </div>
         <div class="stadium2">
            <OppStadium />
         </div>
      </div>
   </div>
</div>

<style>
.gameboard {
   transform: scale(var(--board-scale, 1));
   transform-origin: top center;
}
.active, .stadium, .play, .bench, .deck, .discard, .prizes, .lz, .hand {
   position: absolute;
   display: flex;
}
.active1 {
   width: 100%;
   height: 100%;
}
.active2 {
   width: 100%;
   height: 100%;
}
.flip {
   transform: rotate(180deg);
}

/* Player Side Layout */
.hand { position: absolute; right: 0; bottom: 0; display: flex; }
.active { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); display: flex; }
.bench { position: absolute; bottom: 18%; left: 50%; transform: translateX(-50%); display: flex; }
.stadium { position: absolute; bottom: 35%; left: 2%; display: flex; }
.prizes { position: absolute; top: 35%; left: 2%; display: flex; }
.deck { position: absolute; bottom: 35%; right: 2%; display: flex; }
.discard { position: absolute; bottom: 18%; right: 2%; display: flex; }
.lz { position: absolute; top: 18%; right: 2%; display: flex; }
.play { position: absolute; top: 35%; left: 50%; transform: translateX(-50%); display: flex; }

/* Opponent Side Layout (flipped) */
.hand2 { position: absolute; right: 0; bottom: 0; transform: rotate(180deg); display: flex; }
.bench2 { position: absolute; bottom: 18%; left: 50%; transform: translateX(-50%) rotate(180deg); display: flex; }
.active2 { /* position is handled by parent .active */ }
.stadium2 { position: absolute; bottom: 35%; left: 2%; transform: rotate(180deg); display: flex; }
.prizes2 { position: absolute; top: 35%; left: 2%; transform: rotate(180deg); display: flex; }
.deck2 { position: absolute; bottom: 35%; right: 2%; transform: rotate(180deg); display: flex; }
.discard2 { position: absolute; bottom: 18%; right: 2%; transform: rotate(180deg); display: flex; }
.lz2 { position: absolute; top: 18%; right: 2%; transform: rotate(180deg); display: flex; }
.play2 { position: absolute; top: 35%; left: 50%; transform: translateX(-50%) rotate(180deg); display: flex; }
</style>