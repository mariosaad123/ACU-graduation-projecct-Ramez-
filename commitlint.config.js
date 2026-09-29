export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', ['web', 'api', 'shared', 'db', 'ci', 'deps', 'docs', 'repo']],
    'header-max-length': [2, 'always', 100],
  },
};
