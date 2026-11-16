import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { aPage, aPublicWinner, anAuction, apiError, fakeApi } from './test/fakeApi';
import { renderApp } from './test/renderApp';

const AUCTIONS = 'GET /api/v1/auctions';
const WINNERS = 'GET /api/v1/winners';
const winners = (items = [aPublicWinner()]) => ({ items, total: items.length, page: 1, limit: 20 });

describe('browser tab title', () => {
  it('is the site name on the home page and names every other page', async () => {
    fakeApi({ [AUCTIONS]: [200, aPage([anAuction()])], [WINNERS]: [200, winners()] });
    const { user } = renderApp('/');
    await waitFor(() => expect(document.title).toBe('LUB Auction'));

    await user.click(screen.getByRole('link', { name: 'Winners' }));
    await waitFor(() => expect(document.title).toBe('Recent winners · LUB Auction'));

    await user.click(screen.getByRole('link', { name: 'Sign in' }));
    await waitFor(() => expect(document.title).toBe('Sign in · LUB Auction'));
  });

  it('names an auction page after the auction, and says so when there is none', async () => {
    const auction = anAuction({ title: 'Win a Samsung Galaxy A55' });
    const missing = '00000000-0000-4000-8000-000000000000';
    fakeApi({
      [`GET /api/v1/auctions/${auction.id}`]: [200, auction],
      [`GET /api/v1/auctions/${missing}`]: apiError(404, 'NOT_FOUND'),
    });
    const first = renderApp(`/auctions/${auction.id}`);
    await waitFor(() => expect(document.title).toBe('Win a Samsung Galaxy A55 · LUB Auction'));
    first.unmount();

    renderApp(`/auctions/${missing}`);
    await waitFor(() => expect(document.title).toBe('Auction not found · LUB Auction'));
  });

  it('names an unknown address', async () => {
    fakeApi({});
    renderApp('/no-such-page');
    await waitFor(() => expect(document.title).toBe('Page not found · LUB Auction'));
  });
});

describe('moving between pages', () => {
  it('starts the new page at the top with the keyboard on it', async () => {
    fakeApi({ [AUCTIONS]: [200, aPage([anAuction()])], [WINNERS]: [200, winners()] });
    const scrollTo = vi.spyOn(window, 'scrollTo');
    const { user } = renderApp('/');
    await screen.findByRole('heading', { name: 'Lowest unique bid wins' });
    // The first page is left to the browser.
    expect(document.activeElement).toBe(document.body);
    expect(scrollTo).not.toHaveBeenCalled();

    await user.click(screen.getByRole('link', { name: 'Winners' }));
    await screen.findByRole('heading', { name: 'Recent winners' });
    expect(document.activeElement).toBe(screen.getByRole('main'));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });
});

describe('offline notice', () => {
  it('appears while the device has no connection and goes when it returns', async () => {
    fakeApi({ [AUCTIONS]: [200, aPage([anAuction()])] });
    renderApp('/');
    await screen.findByRole('heading', { name: 'Lowest unique bid wins' });
    expect(screen.queryByText(/You are offline/)).not.toBeInTheDocument();

    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event('offline')));
    expect(screen.getByText(/You are offline/)).toHaveAttribute('role', 'status');

    onLine.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event('online')));
    expect(screen.queryByText(/You are offline/)).not.toBeInTheDocument();
  });
});

describe('a page that fails to draw', () => {
  it('shows a message in place of the page, keeps the navigation, and recovers on another page', async () => {
    // An answer the page cannot draw: the list is missing.
    fakeApi({ [AUCTIONS]: [200, aPage([anAuction()])], [WINNERS]: [200, { total: 1, page: 1, limit: 20 }] });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { user } = renderApp('/winners');

    expect(await screen.findByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload the page' })).toBeInTheDocument();
    expect(logged).toHaveBeenCalled();

    await user.click(screen.getByRole('link', { name: 'Auctions' }));
    expect(await screen.findByRole('heading', { name: 'Lowest unique bid wins' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Something went wrong' })).not.toBeInTheDocument();
  });
});
