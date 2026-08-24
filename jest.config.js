module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts'],
  // Zona horaria fija: sin esto los tests de fechas dan falso verde en un CI
  // en UTC. Ver el porqué en jest.globalSetup.js.
  globalSetup: '<rootDir>/jest.globalSetup.js',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))',
  ],
};
