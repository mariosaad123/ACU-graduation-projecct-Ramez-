/** Logical properties are required so every layout mirrors correctly between Arabic and English. */
export default {
  extends: ['stylelint-config-standard'],
  plugins: ['stylelint-use-logical'],
  rules: {
    'csstools/use-logical': 'always',
    // Global utility classes are kebab-case; CSS Module classes are camelCase (see overrides).
    'selector-class-pattern': '^[a-z][a-z0-9-]*$',
    'custom-property-pattern': '^[a-z][a-z0-9-]*$',
    // Package imports must stay plain strings so Vite resolves them from node_modules.
    'import-notation': 'string',
    'keyframes-name-pattern': '^[a-z][a-z0-9-]*$',
    'value-keyword-case': ['lower', { camelCaseSvgKeywords: false }],
    // Token groups (palette, spacing, motion...) are separated by blank lines on purpose.
    'custom-property-empty-line-before': null,
  },
  overrides: [
    {
      files: ['**/*.module.css'],
      rules: {
        'selector-class-pattern': [
          '^[a-z][a-zA-Z0-9]*$',
          { message: 'Use camelCase class names so CSS Modules can be accessed as styles.name' },
        ],
      },
    },
  ],
  ignoreFiles: ['**/dist/**', '**/coverage/**', '**/node_modules/**'],
};
