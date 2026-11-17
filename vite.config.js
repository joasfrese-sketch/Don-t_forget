import { defineConfig } from 'vite';
// base './' damit die App auch in einem Unterordner läuft (GitHub Pages: …github.io/<repo>/)
export default defineConfig({ base: './', build: { target: 'es2020' } });
