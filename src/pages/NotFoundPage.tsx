import { ButtonLink } from '../components/ui';
import { usePageTitle } from '../lib/usePageTitle';

export function NotFoundPage() {
  usePageTitle('Page not found');
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-slate-600">The page you asked for does not exist.</p>
      <ButtonLink to="/" className="mt-6">
        See all auctions
      </ButtonLink>
    </div>
  );
}
