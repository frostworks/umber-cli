module.exports = {
  env: {
    node: true,
    es2022: true,
  },
  extends: 'airbnb-base',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    // Our CLI is built on console logging for user feedback.
    'no-console': 'off',

    // Node.js with ES Modules requires file extensions, but Airbnb's style guide forbids them.
    // This rule override fixes that conflict for our project.
    'import/extensions': 'off',
    
    // Allows us to use for...of loops, which are common and useful.
    'no-restricted-syntax': 'off',
    'no-await-in-loop': 'off',

    // --- ADD THIS BLOCK TO CUSTOMIZE MAX LINE LENGTH ---
    'max-len': ['error', {
      code: 255,
      ignoreUrls: true,
      ignoreStrings: true,
      ignoreTemplateLiterals: true,
      ignoreRegExpLiterals: true,
    }],
  },
};