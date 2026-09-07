import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'zod/index': 'src/zod/index.ts',
    'express/index': 'src/express/index.ts',
    'openai/index': 'src/openai/index.ts',
    'anthropic/index': 'src/anthropic/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: false,
  clean: true,
  splitting: true,
  treeshake: true,
  target: 'node18',
  platform: 'node',
});
