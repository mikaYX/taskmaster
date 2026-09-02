import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'e2e/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'react-refresh/only-export-components': ['warn', {
        allowConstantExport: true,
        allowExportNames: [
          'badgeVariants',
          'buttonVariants',
          'queryClient',
          'tabsListVariants',
          'useFormField',
          'useSidebar',
          'useTheme',
        ],
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      // Prévention du reverse-tabnabbing : tout <a target="_blank"> doit porter rel="noopener noreferrer".
      // Note : ce sélecteur signale l'absence totale d'attribut `rel`. Les
      // attributs `rel` malformés (sans noopener/noreferrer) restent à
      // contrôler en revue ou via un plugin react dédié (non installé ici).
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXOpeningElement:has(JSXAttribute[name.name='target'][value.value='_blank']):not(:has(JSXAttribute[name.name='rel']))",
          message: 'Ajouter rel="noopener noreferrer" sur tout lien target="_blank" (prévention reverse-tabnabbing / fuite Referer).',
        },
      ],
    },
  },
])
