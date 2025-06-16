<script>
   import { getContext, onMount } from 'svelte'
   import { autoMulligan } from '$lib/stores/settings.js'
   import { share, publishLog } from '$lib/stores/connection.js'
   import { cog } from '$lib/icons/paths.js'
   import Icon from '$lib/components/Icon.svelte'
   import Settings from './dialogs/Settings.svelte'

   import {
      cards, deck, hand, prizes, draw,
      vstarUsed, gxUsed, pokemonHidden,
      reset as resetBoard,
      shareBoardstate
   } from '$lib/stores/player.js'

   import { gameSession } from '$lib/stores/gameSession.js'

   const { showMessage } = getContext('boardActions')

   // Make game session reactive
   $: currentSession = $gameSession
   $: isSessionActive = currentSession && currentSession.gameState !== 'ended'

   /* Game Flow */
   let turn = 0

   function hasBasic (cards) {
      for (const card of cards) {
         if (card.stage === 'basic') return true
      }
      return false
   }

   $: deckValid = hasBasic($cards)

   function draw7andPutPrizes () {
      resetBoard()

      deck.shuffle()
      draw(7, true)

      for (let i = 0; i < 6; i++) {
         const card = deck.pop()
         if (card) prizes.push(card)
      }
   }

   function setupBoard () {

      if ($autoMulligan) {
         let mulligans = 0
         let hasBasic = false

         while (!hasBasic) {
            draw7andPutPrizes()

            for (const card of $hand) {
               if (card.stage === 'basic') hasBasic = true
            }

            if (!hasBasic) mulligans++
         }

         return mulligans
      }

      // else
      draw7andPutPrizes()
   }

   function setup () {
      if (!deckValid && $autoMulligan) return
      const mulligans = setupBoard()
      if ($autoMulligan) showMessage(`${mulligans} Mulligans`)

      turn = 0

      // Log game setup to session
      gameSession.logAction('player1', 'gameStarted', {
         mulligans,
         autoMulligan: $autoMulligan,
         deckValid
      })

      publishLog('Setup' + ($autoMulligan ? ` - ${mulligans} Mulligans` : ''))
      shareBoardstate()
   }

   function reset () {
      // End current game session if active
      if (gameSession.isActive()) {
         gameSession.endGame(null, 'reset')
      }

      resetBoard()
      turn = 0

      share('boardReset')
      publishLog('Reset')
   }

   /* Misc. Actions */

   function flipCoin () {
      const heads = Math.floor(Math.random() * 2)
      showMessage('Coin flip result: ' + (heads ? 'HEADS' : 'TAILS'))
      publishLog('Coin flip: ' + (heads ? 'HEADS' : 'TAILS'))
   }

   function switchVisibility () {
      pokemonHidden.update(val => !val)
      share('pokemonToggle', { hidden: pokemonHidden.get() })
   }

   /* Game Logging */
   async function saveGame () {
      try {
         const filename = await gameSession.saveCurrentGame()
         showMessage(`Game saved: ${filename}`)
         publishLog('Game data saved to file')
      } catch (error) {
         showMessage('Error saving game')
         console.error('Save game error:', error)
      }
   }

   function declareWinner (winner) {
      if (gameSession.isActive()) {
         gameSession.endGame(winner, 'declared')
         showMessage(`${winner === 'player1' ? 'You' : 'Opponent'} wins!`)
         publishLog(`${winner === 'player1' ? 'Player 1' : 'Player 2'} declared winner`)
      }
   }

   /* Enhanced turn tracking */
   function startTurn () {
      turn++
      draw()
      
      // Log turn start
      gameSession.logAction('player1', 'turnStarted', { 
         turnNumber: turn 
      })
   }

   /* Keyboard shortcuts */

   function keydown (e) {
      const key = e.key.toLowerCase()

      if (key === 'n') {
         if (window.confirm('Start new game?')) setup()
      }
      else if (key === 'c') startTurn()
      else if (key === 'f') flipCoin()
      else if (key === 'z') switchVisibility()
   }

   onMount(() => {
      document.addEventListener('keydown', keydown)
      return () => {
         document.removeEventListener('keydown', keydown)
      }
   })

   let settings // DOM element binding
</script>

<div class="self-center flex flex-col gap-2 p-3 w-[170px]">
   <button class="action" disabled={!deckValid && $autoMulligan} on:click={setup} title="Shortcut: N">Setup</button>
   <button class="action" on:click={reset}>Reset</button>

   <div class="flex flex-col rounded-lg border border-gray-400">
      <button on:click={() => startTurn()} class="p-2 rounded-t-lg" title="Shortcut: C" >Turn <span class="font-bold">{turn}</span></button>
      <button on:click={() => vstarUsed.set(!$vstarUsed)} class="toggle p-2" class:on={$vstarUsed}>VSTAR Power</button>
      <button on:click={() => gxUsed.set(!$gxUsed)} class="toggle p-2 rounded-b-lg" class:on={$gxUsed}>GX Attack</button>
   </div>

   <!-- Game Logging Section -->
   {#if isSessionActive}
      <div class="flex flex-col rounded-lg border border-green-400 bg-green-50">
         <div class="text-xs text-center p-1 text-green-800 font-semibold">Game Session Active</div>
         <button class="action-small" on:click={saveGame}>Save Game</button>
         <div class="flex">
            <button class="action-small flex-1 rounded-r-none" on:click={() => declareWinner('player1')}>I Win</button>
            <button class="action-small flex-1 rounded-l-none" on:click={() => declareWinner('player2')}>Opp Wins</button>
         </div>
      </div>
   {/if}

   <button class="action" on:click={flipCoin} title="Shortcut: F">Flip Coin</button>
   <button class="action" on:click={switchVisibility} title="Shortcut: Z">{$pokemonHidden ? 'Show' : 'Hide'} Pokémon</button>

   <button on:click|stopPropagation={() => settings.open()}>
      <Icon path={cog} />
   </button>
</div>

<Settings bind:this={settings} />

<style>
   button.action {
      @apply font-bold text-white bg-[var(--primary-color)] px-3 py-1 rounded-lg;
   }

   button.action:disabled {
      @apply font-normal cursor-default border-gray-500 text-gray-600 bg-gray-100;
   }

   button.action-small {
      @apply text-sm font-semibold text-white bg-green-600 px-2 py-1 rounded-lg;
   }

   button.action-small:hover {
      @apply bg-green-700;
   }

   button.toggle.on {
      background-color: rgba(254, 240, 138, 0.6);
   }
</style>