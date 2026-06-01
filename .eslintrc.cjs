module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: ['node_modules/', 'src/storage/'],
  overrides: [
    {
      files: ['src/v2/**/*.js'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/src/app/**', '../app/**', '../../app/**', '../../../app/**', '../../../../app/**'],
                message: 'v2 code must not import legacy src/app modules.',
              },
            ],
          },
        ],
      },
    },
  ],
};
