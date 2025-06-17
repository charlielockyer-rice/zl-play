<script>
   import "virtual:windi.css"
   import '../global.css'
</script>

<nav class="flex justify-center items-center gap-4 bg-gray-800 text-white p-4">
  <a href="/" class="hover:text-gray-300">Home</a>
  <a href="/sessions" class="hover:text-gray-300">Sessions</a>
</nav>

<main class="flex-grow">
<slot></slot>
</main>