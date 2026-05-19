import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const ROOT = process.cwd()
const TARGET = path.join(ROOT, 'apps', 'web')

const spacing = new Map([
  ['0', '0'],
  ['0rem', '0'],
  ['0px', '0'],
  ['0.125rem', '0.5'],
  ['0.25rem', '1'],
  ['0.35rem', '1.5'],
  ['0.375rem', '1.5'],
  ['0.4rem', '1.5'],
  ['0.45rem', '2'],
  ['0.5rem', '2'],
  ['0.6rem', '2.5'],
  ['0.625rem', '2.5'],
  ['0.75rem', '3'],
  ['0.85rem', '3.5'],
  ['0.9rem', '3.5'],
  ['1rem', '4'],
  ['1.1rem', '4'],
  ['1.2rem', '5'],
  ['1.25rem', '5'],
  ['1.4rem', '6'],
  ['1.5rem', '6'],
  ['1.75rem', '7'],
  ['2rem', '8'],
  ['2.5rem', '10'],
  ['3rem', '12'],
  ['4rem', '16'],
  ['5rem', '20'],
  ['8px', '2'],
  ['10px', '2.5'],
  ['12px', '3'],
  ['14px', '3.5'],
  ['16px', '4'],
  ['20px', '5'],
  ['24px', '6'],
  ['32px', '8'],
  ['36px', '9'],
  ['40px', '10'],
  ['48px', '12'],
  ['64px', '16'],
])

const colors = new Map([
  ['white', 'white'],
  ['#ffffff', 'white'],
  ['transparent', 'transparent'],
  ['#0f172a', 'slate-950'],
  ['#111827', 'gray-900'],
  ['#1e293b', 'slate-800'],
  ['#1f2937', 'gray-800'],
  ['#334155', 'slate-700'],
  ['#374151', 'gray-700'],
  ['#475569', 'slate-600'],
  ['#64748b', 'slate-500'],
  ['#6b7280', 'gray-500'],
  ['#94a3b8', 'slate-400'],
  ['#9ca3af', 'gray-400'],
  ['#cbd5e1', 'slate-300'],
  ['#e2e8f0', 'slate-200'],
  ['#f1f5f9', 'slate-100'],
  ['#f8fafc', 'slate-50'],
  ['#1d4ed8', 'blue-700'],
  ['#2563eb', 'blue-600'],
  ['#3b82f6', 'blue-500'],
  ['#0f766e', 'teal-700'],
  ['#15803d', 'green-700'],
  ['#059669', 'emerald-600'],
  ['#047857', 'emerald-700'],
  ['#b91c1c', 'red-700'],
  ['#dc2626', 'red-600'],
  ['#ef4444', 'red-500'],
  ['#991b1b', 'red-800'],
  ['#ca8a04', 'yellow-600'],
  ['#f59e0b', 'amber-500'],
  ['#7c3aed', 'violet-600'],
  ['#6d28d9', 'violet-700'],
])

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'playwright-report') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else if (entry.isFile() && full.endsWith('.tsx')) files.push(full)
  }
  return files
}

function literalText(node) {
  if (ts.isStringLiteralLike(node)) return node.text
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (ts.isNumericLiteral(node)) return node.text
  return undefined
}

function normalized(value) {
  return String(value).trim().toLowerCase()
}

function toSizeClass(prefix, value) {
  const raw = String(value).trim()
  const key = normalized(raw)
  const token = spacing.get(key)
  if (token) return `${prefix}-${token}`
  if (/^\d+px$/.test(key) || /^\d+(\.\d+)?rem$/.test(key) || /^\d+%$/.test(key)) {
    return `${prefix}-[${raw.replaceAll(' ', '_')}]`
  }
  if (key === '100%') return `${prefix}-full`
  if (key === 'auto') return `${prefix}-auto`
  return null
}

function toColorClass(prefix, value) {
  const key = normalized(value)
  const token = colors.get(key)
  if (token) return `${prefix}-${token}`
  if (key.startsWith('rgba(') || key.startsWith('rgb(') || key.startsWith('#')) {
    return `${prefix}-[${String(value).replaceAll(' ', '_')}]`
  }
  if (key.startsWith('var(')) return `${prefix}-[${String(value).replaceAll(' ', '_')}]`
  return null
}

function mapBoxValues(prefix, value) {
  const parts = String(value).trim().split(/\s+/)
  if (parts.length === 1) {
    const one = toSizeClass(prefix, parts[0])
    return one ? [one] : null
  }
  if (parts.length === 2) {
    const y = toSizeClass(`${prefix}y`, parts[0])
    const x = toSizeClass(`${prefix}x`, parts[1])
    return y && x ? [y, x] : null
  }
  if (parts.length === 4) {
    const top = toSizeClass(`${prefix}t`, parts[0])
    const right = toSizeClass(`${prefix}r`, parts[1])
    const bottom = toSizeClass(`${prefix}b`, parts[2])
    const left = toSizeClass(`${prefix}l`, parts[3])
    return top && right && bottom && left ? [top, right, bottom, left] : null
  }
  return null
}

function mapStyle(prop, value) {
  const v = String(value).trim()
  const key = normalized(v)
  switch (prop) {
    case 'display':
      return ['flex', 'grid', 'block', 'inline-flex', 'inline-block', 'none'].includes(key)
        ? [key === 'none' ? 'hidden' : key]
        : null
    case 'flexDirection':
      return key === 'column' ? ['flex-col'] : key === 'row' ? ['flex-row'] : null
    case 'flexWrap':
      return key === 'wrap' ? ['flex-wrap'] : key === 'nowrap' ? ['flex-nowrap'] : null
    case 'alignItems':
      return { center: 'items-center', 'flex-start': 'items-start', 'flex-end': 'items-end', stretch: 'items-stretch' }[key] ? [{ center: 'items-center', 'flex-start': 'items-start', 'flex-end': 'items-end', stretch: 'items-stretch' }[key]] : null
    case 'justifyContent':
      return { center: 'justify-center', 'space-between': 'justify-between', 'flex-end': 'justify-end', 'flex-start': 'justify-start', 'space-around': 'justify-around' }[key] ? [{ center: 'justify-center', 'space-between': 'justify-between', 'flex-end': 'justify-end', 'flex-start': 'justify-start', 'space-around': 'justify-around' }[key]] : null
    case 'gap':
      return [toSizeClass('gap', v)].filter(Boolean)
    case 'rowGap':
      return [toSizeClass('gap-y', v)].filter(Boolean)
    case 'columnGap':
      return [toSizeClass('gap-x', v)].filter(Boolean)
    case 'padding':
      return mapBoxValues('p', v)
    case 'paddingTop':
      return [toSizeClass('pt', v)].filter(Boolean)
    case 'paddingRight':
      return [toSizeClass('pr', v)].filter(Boolean)
    case 'paddingBottom':
      return [toSizeClass('pb', v)].filter(Boolean)
    case 'paddingLeft':
      return [toSizeClass('pl', v)].filter(Boolean)
    case 'margin':
      return mapBoxValues('m', v)
    case 'marginTop':
      return [toSizeClass('mt', v)].filter(Boolean)
    case 'marginRight':
      return [toSizeClass('mr', v)].filter(Boolean)
    case 'marginBottom':
      return [toSizeClass('mb', v)].filter(Boolean)
    case 'marginLeft':
      return [toSizeClass('ml', v)].filter(Boolean)
    case 'width':
      return [toSizeClass('w', v)].filter(Boolean)
    case 'height':
      return [toSizeClass('h', v)].filter(Boolean)
    case 'minWidth':
      return [toSizeClass('min-w', v)].filter(Boolean)
    case 'maxWidth':
      return [toSizeClass('max-w', v)].filter(Boolean)
    case 'minHeight':
      return [toSizeClass('min-h', v)].filter(Boolean)
    case 'maxHeight':
      return [toSizeClass('max-h', v)].filter(Boolean)
    case 'borderRadius':
      if (key === '50%' || key === '999px' || key === '9999px') return ['rounded-full']
      return [toSizeClass('rounded', v)].filter(Boolean)
    case 'border':
      if (key === 'none' || key === '0') return ['border-0']
      if (key.startsWith('1px solid')) return ['border']
      if (key.startsWith('1px dashed')) return ['border border-dashed']
      return null
    case 'borderTop':
      return key.startsWith('1px solid') ? ['border-t'] : null
    case 'borderBottom':
      return key.startsWith('1px solid') ? ['border-b'] : null
    case 'borderLeft':
      return key.startsWith('1px solid') ? ['border-l'] : key.startsWith('2px solid') ? ['border-l-2'] : key.startsWith('3px solid') ? ['border-l-4'] : null
    case 'background':
    case 'backgroundColor':
      return [toColorClass('bg', v)].filter(Boolean)
    case 'color':
      return [toColorClass('text', v)].filter(Boolean)
    case 'fontSize':
      return [toSizeClass('text', v)].filter(Boolean)
    case 'fontWeight':
      return { 400: 'font-normal', 500: 'font-medium', 600: 'font-semibold', 700: 'font-bold', 800: 'font-extrabold', 900: 'font-black', normal: 'font-normal', medium: 'font-medium', semibold: 'font-semibold', bold: 'font-bold' }[key] ? [{ 400: 'font-normal', 500: 'font-medium', 600: 'font-semibold', 700: 'font-bold', 800: 'font-extrabold', 900: 'font-black', normal: 'font-normal', medium: 'font-medium', semibold: 'font-semibold', bold: 'font-bold' }[key]] : null
    case 'textAlign':
      return { left: 'text-left', center: 'text-center', right: 'text-right' }[key] ? [{ left: 'text-left', center: 'text-center', right: 'text-right' }[key]] : null
    case 'lineHeight':
      return key === '1.5' ? ['leading-6'] : key === '1.6' ? ['leading-7'] : [`leading-[${v}]`]
    case 'position':
      return ['relative', 'absolute', 'fixed', 'sticky'].includes(key) ? [key] : null
    case 'inset':
      return key === '0' ? ['inset-0'] : null
    case 'top':
      return [toSizeClass('top', v)].filter(Boolean)
    case 'right':
      return [toSizeClass('right', v)].filter(Boolean)
    case 'bottom':
      return [toSizeClass('bottom', v)].filter(Boolean)
    case 'left':
      return [toSizeClass('left', v)].filter(Boolean)
    case 'zIndex':
      return [`z-[${v}]`]
    case 'overflow':
      return { hidden: 'overflow-hidden', auto: 'overflow-auto', scroll: 'overflow-scroll', visible: 'overflow-visible' }[key] ? [{ hidden: 'overflow-hidden', auto: 'overflow-auto', scroll: 'overflow-scroll', visible: 'overflow-visible' }[key]] : null
    case 'overflowX':
      return { hidden: 'overflow-x-hidden', auto: 'overflow-x-auto', scroll: 'overflow-x-scroll' }[key] ? [{ hidden: 'overflow-x-hidden', auto: 'overflow-x-auto', scroll: 'overflow-x-scroll' }[key]] : null
    case 'overflowY':
      return { hidden: 'overflow-y-hidden', auto: 'overflow-y-auto', scroll: 'overflow-y-scroll' }[key] ? [{ hidden: 'overflow-y-hidden', auto: 'overflow-y-auto', scroll: 'overflow-y-scroll' }[key]] : null
    case 'cursor':
      return { pointer: 'cursor-pointer', 'not-allowed': 'cursor-not-allowed', default: 'cursor-default' }[key] ? [{ pointer: 'cursor-pointer', 'not-allowed': 'cursor-not-allowed', default: 'cursor-default' }[key]] : null
    case 'opacity':
      return [`opacity-[${v}]`]
    case 'flex':
      return [`flex-[${v.replaceAll(' ', '_')}]`]
    case 'flexShrink':
      return key === '0' ? ['shrink-0'] : [`shrink-[${v}]`]
    case 'flexGrow':
      return key === '1' ? ['grow'] : [`grow-[${v}]`]
    case 'gridTemplateColumns':
      return [`grid-cols-[${v.replaceAll(' ', '_')}]`]
    case 'listStyle':
      return key === 'none' ? ['list-none'] : null
    case 'whiteSpace':
      return { nowrap: 'whitespace-nowrap', normal: 'whitespace-normal' }[key] ? [{ nowrap: 'whitespace-nowrap', normal: 'whitespace-normal' }[key]] : null
    case 'textOverflow':
      return key === 'ellipsis' ? ['text-ellipsis'] : null
    case 'objectFit':
      return { cover: 'object-cover', contain: 'object-contain' }[key] ? [{ cover: 'object-cover', contain: 'object-contain' }[key]] : null
    case 'boxShadow':
      return key === 'none' ? ['shadow-none'] : ['shadow']
    case 'transition':
    case 'transitionProperty':
      return ['transition']
    case 'transform':
      if (key === 'translatey(-50%)') return ['-translate-y-1/2']
      return null
    case 'WebkitLineClamp':
      return [`line-clamp-${v}`]
    case 'WebkitBoxOrient':
      return key === 'vertical' ? [] : null
    default:
      return null
  }
}

function propName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text
  return null
}

function objectToClasses(obj) {
  const classes = []
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    const name = propName(prop.name)
    if (!name) continue
    const value = literalText(prop.initializer)
    if (value === undefined) continue
    const mapped = mapStyle(name, value)
    if (!mapped) continue
    classes.push(...mapped)
  }
  return [...new Set(classes.filter(Boolean).flatMap((item) => String(item).split(/\s+/)).filter(Boolean))]
}

function collectStyleObjects(sf) {
  const styleObjects = new Map()

  function readObjectLiteral(obj) {
    const direct = objectToClasses(obj)
    if (direct) return { __classes: direct }

    const nested = {}
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) return null
      const name = propName(prop.name)
      if (!name || !ts.isObjectLiteralExpression(prop.initializer)) return null
      const classes = objectToClasses(prop.initializer)
      if (!classes) return null
      nested[name] = classes
    }
    return nested
  }

  function visit(node) {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
          const parsed = readObjectLiteral(decl.initializer)
          if (parsed) styleObjects.set(decl.name.text, parsed)
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sf)
  return styleObjects
}

function classesFromStyleExpression(expr, styleObjects) {
  if (ts.isObjectLiteralExpression(expr)) return objectToClasses(expr)
  if (ts.isIdentifier(expr)) {
    const found = styleObjects.get(expr.text)
    return found?.__classes || null
  }
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
    const found = styleObjects.get(expr.expression.text)
    return found?.[expr.name.text] || null
  }
  return null
}

function classAttrInfo(opening) {
  for (const attr of opening.attributes.properties) {
    if (ts.isJsxAttribute(attr) && attr.name.text === 'className') {
      if (!attr.initializer) return { attr, kind: 'empty' }
      if (ts.isStringLiteral(attr.initializer)) return { attr, kind: 'string', value: attr.initializer.text }
      return { attr, kind: 'other' }
    }
  }
  return null
}

function migrateFile(file) {
  const source = fs.readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const replacements = []
  const styleObjects = collectStyleObjects(sf)
  let needsCn = false

  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const classInfo = classAttrInfo(node)
      for (const attr of node.attributes.properties) {
        if (!ts.isJsxAttribute(attr) || attr.name.text !== 'style' || !attr.initializer || !ts.isJsxExpression(attr.initializer)) continue
        const expr = attr.initializer.expression
        if (!expr) continue
        const classes = classesFromStyleExpression(expr, styleObjects) || []
        const add = classes.join(' ')
        if (classes.length === 0) {
          replacements.push({ start: attr.getFullStart(), end: attr.end, text: '' })
          continue
        }
        if (!classInfo) {
          replacements.push({ start: attr.getFullStart(), end: attr.end, text: ` className="${add}"` })
        } else if (classInfo.kind === 'string') {
          const init = classInfo.attr.initializer
          replacements.push({ start: init.getStart(sf), end: init.end, text: `"${`${classInfo.value} ${add}`.trim()}"` })
          replacements.push({ start: attr.getFullStart(), end: attr.end, text: '' })
        } else if (classInfo.kind === 'other' && classInfo.attr.initializer && ts.isJsxExpression(classInfo.attr.initializer)) {
          const existing = classInfo.attr.initializer.expression
          if (!existing) continue
          needsCn = true
          const current = existing.getText(sf)
          replacements.push({ start: classInfo.attr.initializer.getStart(sf), end: classInfo.attr.initializer.end, text: `{cn(${current}, "${add}")}` })
          replacements.push({ start: attr.getFullStart(), end: attr.end, text: '' })
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sf)
  if (replacements.length === 0) return 0
  let output = source
  if (needsCn && !output.includes("from '@/lib/utils'") && !output.includes('from "@/lib/utils"')) {
    const importMatch = output.match(/(?:^|\n)import .*? from ['"].*?['"];?/)
    const insertAt = importMatch ? importMatch.index + importMatch[0].length : 0
    replacements.push({ start: insertAt, end: insertAt, text: `\nimport { cn } from '@/lib/utils'` })
  }
  for (const rep of replacements.sort((a, b) => b.start - a.start)) {
    output = output.slice(0, rep.start) + rep.text + output.slice(rep.end)
  }
  fs.writeFileSync(file, output)
  return replacements.length
}

let total = 0
const changed = []
for (const file of walk(TARGET)) {
  const count = migrateFile(file)
  if (count > 0) {
    total += count
    changed.push(path.relative(ROOT, file))
  }
}

console.log(JSON.stringify({ total, files: changed.length, changed }, null, 2))
