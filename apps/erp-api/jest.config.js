module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
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
  // era del 32%) y ademas nunca se evaluaba, porque CI corria `jest` sin
  // --coverage: el umbral era texto muerto. Se fija en lo que hay hoy para que
  // deje de bajar, y se sube a medida que se cubren los modulos que mueven
  // dinero. Un suelo honesto que asciende protege; un 80% decorativo, no.
  coverageThreshold: {
    global: {
      branches: 29,
      functions: 30,
      lines: 32,
      statements: 32
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
