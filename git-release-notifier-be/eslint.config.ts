import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', '**/*.js'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'max-params': ['error', { max: 4 }],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      eqeqeq: ['error', 'always'],
      'no-else-return': 'error',
      'array-callback-return': 'error',
      'no-unsafe-negation': 'error',
      'no-template-curly-in-string': 'error',
      'max-depth': ['error', { max: 4 }],
      'newline-before-return': 'error',
      'lines-between-class-members': ['error', 'always'],
      'no-empty-pattern': 'off',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/*.integration.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'max-params': 'off',
    },
  },
);
