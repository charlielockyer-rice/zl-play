export function cardImage (card, size = null) {
   if (card.ptcgApiCode) return ptcgApiImage(card, size)
   else return limitlessImage(card, size)
}

function limitlessImage (card, size) {
   const host = 'https://limitlesstcg.nyc3.digitaloceanspaces.com'
   const sizeMod = size ? '_' + size.toUpperCase() : ''

   if (card.region === 'tpc') {
      return `${host}/tpc/${card.set}/${card.set}_${card.number}_R_JP${sizeMod}.png`

   } else {
      let lang = card.language || 'en'
      if (!card.number) return ''

      const num = card.number.replace(/^(\d{1,3})(a|b)?$/, (_, p1, p2) => {
         return p1.padStart(3, '0') + (p2 || '')
      })

      return `${host}/tpci/${card.set}/${card.set}_${num}_R_${lang.toUpperCase()}${sizeMod}.png`
   }
}

function ptcgApiImage (card, size) {
   const set = card.ptcgApiCode

   let number = card.number
   if (card.set === 'DPP') number = `DP${number.padStart(2, '0')}`
   else if (card.number === '?') number = 'question'

   if (!(size === 'xs' || size === 'sm')) number += '_hires'
   return `https://images.pokemontcg.io/${set}/${number}.png`
}