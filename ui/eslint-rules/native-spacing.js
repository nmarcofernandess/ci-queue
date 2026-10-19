const zeroPadding = /^p[xysetblr]?-(?:0|\[0(?:px|rem)?\])$/
const spacing = /^(?:p[xysetblr]?|gap(?:-[xy])?)-/
const nativeSpacing = new Set(['PopoverContent', 'CardHeader', 'DrawerHeader', 'DrawerFooter'])
const paddedItems = new Set(['Item', 'TableCell', 'TableHead', 'FactsTable'])
const tables = new Set(['Table', 'DataTableFrame', 'FactsTable'])

// Read only class-bearing branches; conditions and arbitrary helper implementations
// are deliberately outside this static check.
function classParts(node) {
  if (!node) return []
  switch (node.type) {
    case 'Literal': return typeof node.value === 'string' ? [node.value] : []
    case 'JSXExpressionContainer': return classParts(node.expression)
    case 'TemplateLiteral': return [...node.quasis.map(part => part.value.raw), ...node.expressions.flatMap(classParts)]
    case 'ConditionalExpression': return [...classParts(node.consequent), ...classParts(node.alternate)]
    case 'LogicalExpression': return [...classParts(node.left), ...classParts(node.right)]
    case 'CallExpression': return node.arguments.flatMap(classParts)
    case 'ArrayExpression': return node.elements.flatMap(classParts)
    case 'ObjectExpression': return node.properties.flatMap(property => property.type === 'Property' && !property.computed ? classParts(property.key) : [])
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression': return classParts(node.expression)
    default: return []
  }
}

function importedComponent(name, sourceCode, node) {
  const local = name.type === 'JSXIdentifier' ? name.name : name.type === 'JSXMemberExpression' && name.object.type === 'JSXIdentifier' ? name.object.name : undefined
  if (!local) return undefined
  let scope = sourceCode.getScope(node)
  while (scope && !scope.set.has(local)) scope = scope.upper
  const definition = scope?.set.get(local)?.defs[0]
  if (definition?.type !== 'ImportBinding') return undefined
  const source = definition.parent.source.value
  const specifier = definition.node
  const component = specifier.type === 'ImportSpecifier' ? specifier.imported.name : specifier.type === 'ImportNamespaceSpecifier' && name.type === 'JSXMemberExpression' ? name.property.name : undefined
  const family = /(?:^|\/)components\/ui\/(item|table|popover|card|drawer|select)(?:\.[cm]?[jt]sx?)?$/.exec(source)?.[1]
  if (family && {
    item: ['Item'], table: ['Table', 'TableCell', 'TableHead'],
    popover: ['PopoverContent'], card: ['CardHeader'],
    drawer: ['DrawerHeader', 'DrawerFooter'], select: ['SelectContent'],
  }[family].includes(component)) return component
  if (/(?:^|\/)(?:features\/)?shared\/facts-table(?:\.[jt]sx?)?$/.test(source) && component === 'FactsTable') return component
  if (/(?:^|\/)(?:features\/)?shared\/data-table-frame(?:\.[jt]sx?)?$/.test(source) && component === 'DataTableFrame') return component
  return undefined
}

export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      padding: 'Preserve o padding nativo de {{component}}; use a API semântica/variante do owner.',
      spacing: 'Preserve padding e gap nativos de {{component}}; configure dados, largura e comportamento sem refazer seu espaçamento.',
      height: 'FilterSelect usa a altura disponível calculada pelo Radix; não fixe max-height no popup.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const component = importedComponent(node.name, context.sourceCode, node)
        if (!component) return
        const attribute = node.attributes.find(attribute => attribute.type === 'JSXAttribute' && attribute.name.name === 'className')
        for (const part of classParts(attribute?.value)) {
          for (const token of part.split(/\s+/)) {
            const utility = token.slice(token.lastIndexOf(':') + 1).replace(/^!|!$/g, '')
            const descendant = token.includes('[&')
            let messageId
            if (zeroPadding.test(utility) && (paddedItems.has(component) || (tables.has(component) && descendant))) messageId = 'padding'
            if (nativeSpacing.has(component) && !descendant && spacing.test(utility)) messageId = 'spacing'
            if (component === 'SelectContent' && /(?:^|\/)filter-select\.tsx$/.test(context.filename) && /^max-h-(?:\d|\[(?:\d|calc\())/.test(utility)) messageId = 'height'
            if (messageId) {
              context.report({ node: attribute, messageId, data: { component } })
              return
            }
          }
        }
      },
    }
  },
}
