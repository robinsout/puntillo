// Feature design-system, criterion 4: colours and sizes come from the tokens only.
const COLOR_FUNCTIONS = [
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color',
]

/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  rules: {
    // Vite resolves a bare string, and the packages of fonts read better without url().
    'import-notation': 'string',
    // The tokens are grouped by kind with blank lines between the groups.
    'custom-property-empty-line-before': null,
    // A font family named in a custom property keeps its proper case.
    'value-keyword-case': ['lower', { ignoreKeywords: ['Georgia'] }],
    // Components order their rules by what they style, not by specificity.
    'no-descending-specificity': null,
    'selector-pseudo-class-no-unknown': [
      true,
      { ignorePseudoClasses: ['deep', 'global', 'slotted'] },
    ],
    'color-no-hex': true,
    'color-named': 'never',
    'function-disallowed-list': COLOR_FUNCTIONS,
    // Custom properties do not work in media queries, so the breakpoints keep their px.
    'unit-disallowed-list': [
      ['px'],
      { ignoreMediaFeatureNames: { px: ['width', 'min-width', 'max-width'] } },
    ],
  },
  overrides: [
    {
      files: ['**/*.vue'],
      customSyntax: 'postcss-html',
    },
    {
      // The one file of values.
      files: ['src/presentation/ui/tokens.css'],
      rules: {
        'color-no-hex': null,
        'color-named': null,
        'function-disallowed-list': null,
        'unit-disallowed-list': null,
      },
    },
  ],
}
