const base = { preset: 'ts-jest', testEnvironment: 'node' };

module.exports = {
  projects: [
    // Lógica pura: sin base de datos ni Docker.
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/test/unit/**/*.test.ts'] },

    // Integración: contra un Postgres descartable (Docker). Jest lo levanta antes y lo baja después.
    {
      ...base,
      displayName: 'integration',
      testMatch: ['<rootDir>/test/*.test.ts'],
      setupFiles: ['<rootDir>/test/support/set-test-env.ts'],
      globalSetup: '<rootDir>/test/support/global-setup.ts',
      globalTeardown: '<rootDir>/test/support/global-teardown.ts',
    },
  ],
};
