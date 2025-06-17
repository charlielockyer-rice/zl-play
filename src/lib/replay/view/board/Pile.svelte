<script>
   // This is a simplified, non-interactive version for the replay viewer.
   export let pile = [];
   export let name = null;
</script>

<div class="pile p-1 rounded flex flex-col focus:outline-none relative">

   {#if name}
      <div class="count">{pile.length}</div>
   {/if}

   <slot></slot>
</div>

<style>
   .count {
      background-color: var(--overlay-color);
      @apply absolute z-10 top-1 left-1 font-bold p-1 rounded-md;
   }
</style>