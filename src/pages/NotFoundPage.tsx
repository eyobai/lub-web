import { ButtonLink } from '../components/ui';
import { usePageTitle } from '../lib/usePageTitle';
import { t } from '../i18n/i18n';

export function NotFoundPage() {
  usePageTitle(t('Page not found'));
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold tracking-tight">{t('Page not found')}</h1>
      <p className="mt-2 text-slate-600">{t('The page you asked for does not exist.')}</p>
      <ButtonLink to="/" className="mt-6">
        {t('See all auctions')}
      </ButtonLink>
    </div>
  );
}
