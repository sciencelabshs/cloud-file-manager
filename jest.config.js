module.exports = {
  "setupFilesAfterEnv": [
    "<rootDir>/src/setupTests.ts"
  ],
  "roots": [
    "<rootDir>/src"
  ],
  "testMatch": [
    "**/__tests__/**/*.+(ts|tsx|js)",
    "**/?(*.)+(spec|test).+(ts|tsx|js)"
  ],
  "transform": {
    "^.+\\.(js|jsx|ts|tsx)$": "ts-jest"
  }
}
