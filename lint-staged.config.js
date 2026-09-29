export default {
  '*.{ts,tsx}': ['eslint --fix --max-warnings=0', 'prettier --write'],
  '*.css': ['stylelint --fix', 'prettier --write'],
  '*.{js,json,md,html,yml,yaml}': 'prettier --write',
};
