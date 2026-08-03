module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // Fabrica certs/demo.pfx si falta: nueve pruebas de firma dependian de un
  // fichero gitignoreado, asi que en CI fallaban y la suite solo estaba verde
  // en las maquinas que ya lo tenian.
  globalSetup: '<rootDir>/jest.global-setup.ts',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.interface.ts',
    '!src/**/*.dto.ts',
    '!src/main.ts'
  ],
  coverageDirectory: 'coverage',
  // json-summary alimenta el resumen que CI publica en cada ejecucion: sin el,
  // el numero solo vive en el log y nadie lo mira.
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  // Suelo, no meta. El 80% que habia aqui no lo cumplia nadie (la cobertura real
  // ronda el 31%) y ademas nunca se evaluaba, porque CI corria `jest` sin
  // --coverage: el umbral era texto muerto.
  //
  // El numero sale de lo que mide CI sobre el codigo commiteado, no de una
  // medicion local: en un arbol de trabajo con specs sin commitear la cobertura
  // sale mas alta de lo que el repositorio puede sostener, y el suelo quedaria
  // por encima de la realidad.
  //
  // Puede subir, nunca bajar.
  coverageThreshold: {
    global: {
      branches: 29,
      functions: 29,
      lines: 31,
      statements: 31
    }
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        skipLibCheck: true
      }
    }]
  }
};
