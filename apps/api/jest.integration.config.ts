import type { Config } from 'jest';

// Pruebas de integración: levantan la aplicación Nest completa contra PostgreSQL real
// (DATABASE_URL de test). El servicio externo de ARCA se reemplaza por un doble de prueba.
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/.*\.int-spec\.ts$',
  transform: { '^.+\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/test/global-setup.ts',
  setupFiles: ['<rootDir>/test/env-setup.ts'],
  testTimeout: 60000,
};

export default config;
