import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['**/node_modules', '**/dist', '**/coverage', 'docs/mockups'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // A05: no dynamic code execution anywhere.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    files: ['web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Only affects hot reload; modules here deliberately export hooks next to components.
      'react-refresh/only-export-components': 'off',
      // Flags react-hook-form's watch(); this app doesn't use the React Compiler.
      'react-hooks/incompatible-library': 'off',
      // A05/XSS: React escapes output; raw HTML injection is banned.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Raw HTML is not allowed (XSS).',
        },
      ],
    },
  },
  {
    files: ['server/src/seed/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
)
