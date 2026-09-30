import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const rawPrimitivePatterns = [{
  group: ['vaul', 'radix-ui', 'radix-ui/*', '@radix-ui/*'],
  message: 'Use os componentes instalados de @/components/ui; não remonte primitivas na feature.',
}]
const drawerPattern = {
  group: ['**/components/ui/drawer', '**/components/ui/drawer.*'],
  message: 'Use DetailDrawer; a composição dos detalhes tem um proprietário único.',
}
const iconPositionRules = [
  { selector: "JSXAttribute[name.name='data-icon'][value=null]", message: 'Use inline-start/inline-end em ícone com texto; remova data-icon em icon-only.' },
  { selector: "JSXAttribute[name.name='data-icon'][value.type='Literal'][value.value!='inline-start'][value.value!='inline-end']", message: 'data-icon aceita somente inline-start ou inline-end.' },
  { selector: "JSXAttribute[name.name='data-icon'][value.type='JSXExpressionContainer']", message: 'A posição do ícone é declarativa: escreva o atributo literal inline-start/inline-end.' },
]
const descendantSvgSizeRule = {
  selector: "JSXAttribute[name.name='className'] :matches(Literal[value=/svg[^ ]*:(size|w|h|min-w|min-h|max-w|max-h)-/], TemplateElement[value.raw=/svg[^ ]*:(size|w|h|min-w|min-h|max-w|max-h)-/])",
  message: 'Não redimensione SVG descendente na feature; use a apresentação do componente dono.',
}
const projectChipRules = [
  { selector: "JSXOpeningElement[name.name='ProjectChip']:not(:has(JSXAttribute[name.name='mode']))", message: 'ProjectChip exige um mode literal: inline ou compact-context.' },
  { selector: "JSXOpeningElement[name.name='ProjectChip'] > JSXAttribute[name.name='mode'][value.type!='Literal']", message: 'O modo de ProjectChip deve ser literal; não passe uma expressão dinâmica.' },
  { selector: "JSXOpeningElement[name.name='ProjectChip'] > JSXAttribute[name.name='className']", message: 'ProjectChip é dono da apresentação; não passe className no consumidor.' },
]
const uiPolicyBlocks = [
  {
    files: ['src/**/*.{ts,tsx}'], ignores: ['src/components/ui/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: rawPrimitivePatterns }],
      'no-restricted-syntax': ['error', ...iconPositionRules, ...projectChipRules],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    ignores: ['src/features/shared/detail-drawer.tsx', 'src/features/shared/entity-identity.tsx'],
    rules: { 'no-restricted-imports': ['error', { patterns: [...rawPrimitivePatterns, drawerPattern] }] },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    ignores: ['src/features/shared/entity-identity.tsx', 'src/features/shared/status-indicator.tsx', 'src/features/shared/presentation.ts'],
    rules: { 'no-restricted-syntax': ['error', ...iconPositionRules, ...projectChipRules, descendantSvgSizeRule] },
  },
]

export default defineConfig([
  globalIgnores(['dist']),
  ...uiPolicyBlocks,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // Os blocos oficiais shadcn exportam componentes e seus helpers/variants do
  // mesmo módulo. Isso é parte do contrato recuperado do registry Nova, não
  // uma exceção para componentes de domínio escritos à mão.
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
