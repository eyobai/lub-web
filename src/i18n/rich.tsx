import { Fragment, type ReactNode } from 'react';
import { t } from './i18n';

/**
 * A translated sentence with parts that are not plain text (a highlighted word, a link, an amount in bold):
 * `tRich('Lowest {unique} bid wins', { unique: <span>…</span> })`. The parts land wherever the translation puts them.
 */
export function tRich(key: string, parts: Record<string, ReactNode>): ReactNode {
  const text = t(key);
  const pieces = text.split(/(\{\w+\})/);
  return pieces.map((piece, i) => {
    const name = /^\{(\w+)\}$/.exec(piece)?.[1];
    return <Fragment key={i}>{name && name in parts ? parts[name] : piece}</Fragment>;
  });
}
