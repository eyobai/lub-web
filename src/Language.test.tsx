import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { language, t, tCount } from './i18n/i18n';
import { aPage, anAuction, fakeApi } from './test/fakeApi';
import { renderApp } from './test/renderApp';

const AUCTIONS = 'GET /api/v1/auctions';

afterEach(() => language.set('en'));

describe('translation', () => {
  it('fills values into the sentence, and falls back to English when a sentence has no Amharic', () => {
    expect(t('Worth {amount}', { amount: 'ETB 5' })).toBe('Worth ETB 5');
    language.set('am');
    expect(t('Worth {amount}', { amount: 'ETB 5' })).toBe('ዋጋው ETB 5');
    expect(t('A sentence nobody translated')).toBe('A sentence nobody translated');
    expect(tCount(3, '{count} bid', '{count} bids')).toBe('3 ቢዶች');
  });

  it('switches the site to Amharic and back, remembers the choice and tells the browser', async () => {
    fakeApi({ [AUCTIONS]: [200, aPage([anAuction()])] });
    const { user } = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Lowest unique bid wins' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Switch to Amharic/ }));
    expect(await screen.findByRole('heading', { name: 'ዝቅተኛው ልዩ ቢድ ያሸንፋል' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ይግቡ' })).toHaveAttribute('href', '/sign-in');
    expect(document.documentElement.lang).toBe('am');
    expect(localStorage.getItem('lub.language')).toBe('am');

    await user.click(screen.getByRole('button', { name: /ወደ እንግሊዝኛ ቀይር/ }));
    expect(await screen.findByRole('heading', { name: 'Lowest unique bid wins' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });
});
