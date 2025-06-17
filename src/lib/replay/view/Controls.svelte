<script>
   // This is a view-only component for the replay screen.
   import { replayState } from '$lib/stores/replayState.js';
   import { cog } from '$lib/icons/paths.js'
   import Icon from '$lib/components/Icon.svelte'

   // The turn count will be managed by the parent replay page
   export let turn = 0;

   // Derive state from the single source of truth
   $: playerState = $replayState?.player;
   $: vstarUsed = playerState?.vstarUsed || false;
   $: gxUsed = playerState?.gxUsed || false;
   $: pokemonHidden = playerState?.pokemonHidden || false;
</script>

<div class="self-center flex flex-col gap-2 p-3 w-[170px]">
   <div class="flex flex-col rounded-lg border border-gray-400">
      <div class="p-2 rounded-t-lg text-center" >Turn <span class="font-bold">{turn}</span></div>
      <div class="toggle p-2" class:on={vstarUsed}>VSTAR Power</div>
      <div class="toggle p-2 rounded-b-lg" class:on={gxUsed}>GX Attack</div>
   </div>

   <div class="action text-center">{pokemonHidden ? 'Pokémon Hidden' : 'Pokémon Shown'}</div>

   <button>
      <Icon path={cog} />
   </button>
</div>

<style>
   .action {
      @apply font-bold text-gray-700 bg-gray-200 px-3 py-1 rounded-lg;
   }

   .toggle {
       padding: 0.5rem;
       text-align: center;
       background-color: #f3f4f6;
       color: #4b5563;
       font-weight: 600;
   }

   .toggle.on {
      background-color: rgba(254, 240, 138, 0.6);
      color: #1f2937;
   }
</style>