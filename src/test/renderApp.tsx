import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App } from '../App';
import { createQueryClient } from '../queryClient';

function CurrentAddress() {
  const location = useLocation();
  return <span data-testid="address">{location.pathname + location.search}</span>;
}

/** Mounts the whole site at `path`, as a browser would, with a fresh cache. */
export function renderApp(path = '/') {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 10_000 } });
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <App queryClient={queryClient} />
      <CurrentAddress />
    </MemoryRouter>,
  );
  return { ...view, user: userEvent.setup(), address: () => view.getByTestId('address').textContent };
}
