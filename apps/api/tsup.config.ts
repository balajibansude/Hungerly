import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  // Workspace packages ship TypeScript source; bundle them into the server build.
  noExternal: [/^@hungerly\//],
  sourcemap: true,
  clean: true,
});
