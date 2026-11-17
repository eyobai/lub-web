// Lists user-facing English text the site shows without translating it, and the t()/tk() keys that have no
// Amharic entry. `node scripts/i18n-check.mjs` prints both; `--keys` prints every key (for the dictionary).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const ROOT = new URL('../src/', import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.|\.d\.ts$|\/test\/|\/i18n\//.test(path)) files.push(path);
  }
})(ROOT);

// Attributes and call arguments that never carry text for people.
const SKIP_ATTRS = new Set([
  'className',
  'to',
  'href',
  'key',
  'id',
  'type',
  'inputMode',
  'autoComplete',
  'role',
  'tone',
  'variant',
  'name',
  'd',
  'viewBox',
  'fill',
  'stroke',
  'strokeWidth',
  'strokeLinecap',
  'strokeLinejoin',
  'src',
  'referrerPolicy',
  'loading',
  'method',
  'lang',
  'aria-hidden',
  'aria-current',
  'aria-live',
  'dateTime',
  'htmlFor',
  'rel',
  'target',
  'aria-controls',
  'aria-describedby',
  'aria-labelledby',
  'data-testid',
  'placeholder-number',
]);
const isEnglish = (s) => /[A-Za-z]{2,}/.test(s) && /\s|^[A-Z][a-z]+[.!?…:]?$/.test(s.trim());
const keys = new Map();
const untranslated = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const where = (n) =>
    `${file.replace(ROOT, 'src/')}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const visit = (node, ignored) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf);
      if (['t', 'tk', 'tCount', 'tRich'].includes(callee)) {
        // The key, or each branch of `cond ? 'a' : 'b'`; the values object is not text.
        const literals = (arg) =>
          ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)
            ? [arg]
            : ts.isConditionalExpression(arg)
              ? [...literals(arg.whenTrue), ...literals(arg.whenFalse)]
              : ts.isParenthesizedExpression(arg)
                ? literals(arg.expression)
                : [];
        const texts = callee === 'tCount' ? node.arguments.slice(1, 3) : node.arguments.slice(0, 1);
        for (const arg of texts) for (const lit of literals(arg)) keys.set(lit.text, where(lit));
        // tRich's parts are JSX that may hold more text.
        if (callee === 'tRich' && node.arguments[1]) visit(node.arguments[1], ignored);
        return;
      }
      // Logging, errors for developers, class names, query keys, routes, storage keys and DOM lookups.
      if (
        /^(console\.\w+|cx|new Error|Error|getElementById|querySelector|setItem|getItem|removeItem|matchMedia|fetch|api\.\w+|unwrap|invalidateQueries|setParams|navigate|URLSearchParams|params\.(get|set|delete)|replace|test|match|split|join|startsWith|endsWith|includes|padStart|padEnd|toLocaleString|format|DateTimeFormat|assign|setAttribute)$/.test(
          callee.split('.').slice(-2).join('.'),
        ) ||
        /^(api|anonymousApi)\./.test(callee)
      ) {
        return ts.forEachChild(node, (c) => visit(c, true));
      }
    }
    if (ts.isNewExpression(node) && /Error|URL|RegExp|Intl/.test(node.expression.getText(sf))) return;
    if (
      ts.isImportDeclaration(node) ||
      ts.isExportDeclaration(node) ||
      ts.isTypeNode(node) ||
      ts.isLiteralTypeNode(node)
    )
      return;
    if (ts.isJsxAttribute(node) && SKIP_ATTRS.has(node.name.getText(sf))) return;
    if (
      ts.isPropertyAssignment(node) &&
      /^(className|queryKey|key|tone|to|href|icon|id|status|code|type)$/.test(node.name.getText(sf))
    )
      return;
    if (
      ts.isElementAccessExpression(node) ||
      (ts.isBinaryExpression(node) && /===|!==/.test(node.operatorToken.getText(sf)))
    )
      return;
    if (ts.isCaseClause(node)) return node.statements.forEach((s) => visit(s, ignored));
    if (
      !ignored &&
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      isEnglish(node.text)
    ) {
      untranslated.push(`${where(node)}  "${node.text}"`);
    }
    if (
      !ignored &&
      ts.isTemplateExpression(node) &&
      isEnglish(node.getText(sf).replace(/\$\{[^}]*\}/g, ''))
    ) {
      untranslated.push(`${where(node)}  ${node.getText(sf).slice(0, 100)}`);
    }
    if (!ignored && ts.isJsxText(node) && isEnglish(node.text))
      untranslated.push(`${where(node)}  ${node.text.trim().slice(0, 100)}`);
    ts.forEachChild(node, (c) => visit(c, ignored));
  };
  visit(sf, false);
}

if (process.argv.includes('--keys')) {
  console.log(JSON.stringify([...keys.keys()].sort(), null, 1));
} else {
  const { am } = await import('../src/i18n/am.ts').catch(() => ({ am: null }));
  if (untranslated.length)
    console.log(`Untranslated text (${untranslated.length}):\n` + untranslated.join('\n'));
  let failed = false;
  if (am) {
    const missing = [...keys].filter(([k]) => !(k in am));
    if (missing.length) {
      failed = true;
      console.log(
        `\nNo Amharic for (${missing.length}):\n` + missing.map(([k, w]) => `${w}  ${k}`).join('\n'),
      );
    }
    const holes = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    const mismatched = Object.entries(am).filter(([k, v]) => holes(k) !== holes(v));
    if (mismatched.length) {
      failed = true;
      console.log(
        `\nPlaceholders differ (${mismatched.length}):\n` +
          mismatched.map(([k, v]) => `${k}  =>  ${v}`).join('\n'),
      );
    }
  }
  console.log(`\n${keys.size} keys.`);
  // --strict (npm run i18n:check) fails on a missing or broken translation; the untranslated list is advisory.
  if (process.argv.includes('--strict') && failed) process.exit(1);
}
