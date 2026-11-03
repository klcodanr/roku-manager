import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';

export default defineConfig({
  build: {
    target: 'node24',
    outDir: 'dist',
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
        // roku-client is CommonJS and loads Node's networking modules with
        // require(). Keep it as a runtime dependency instead of bundling it
        // into the ESM server build.
        'roku-client',
      ],
    },
  },
});
