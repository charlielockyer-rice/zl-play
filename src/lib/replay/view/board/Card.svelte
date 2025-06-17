<script>
   import { cardImage } from '$lib/util/assets.js'
   import cardback from '$lib/assets/cardback_int.png'

   export let card
   export let revealed = true
</script>

<div class="border-2 border-transparent rounded-md">
   {#if revealed && card}
      <img class="card" src="{cardImage(card, 'xs')}" alt="{card.name}" draggable="false">
   {:else}
      <img class="card" src={cardback} alt="Hidden Card" draggable="false">
   {/if}
</div>