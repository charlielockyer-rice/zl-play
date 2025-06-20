import adapter from '@sveltejs/adapter-static'
import 'dotenv/config'

/** @type {import('@sveltejs/kit').Config} */
const config = {
   kit: {
      adapter: adapter({
         fallback: 'index.html'
      })
   }
}

export default config
