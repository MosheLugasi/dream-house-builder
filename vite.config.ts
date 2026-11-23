/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 2000 },
  // the catalog tests build every one of ~700 procedural items (several times for resizable ones):
  // slow CI runners need more than the default 5 s
  test: { testTimeout: 60000 },
});
