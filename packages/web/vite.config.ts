import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [preact(), tailwindcss()],
  build: {
    // The service owns the runtime image, so put the browser bundle in the
    // directory that its static-file middleware serves.
    outDir: '../service/public',
  },
})
