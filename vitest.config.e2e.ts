import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Todos los e2e escriben en la misma base del docker-compose: si corren en
    // paralelo, uno ve los datos que otro está creando (p. ej. QA-1.1 compara
    // el contenido de todas las tablas). Se ejecutan de a un archivo a la vez.
    fileParallelism: false,
  },
});
