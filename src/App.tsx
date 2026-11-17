import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { LanguageProvider } from './i18n/LanguageProvider';
import { GuestOnly, PublicPages, RequireAuth } from './auth/guards';
import { AppShell } from './components/AppShell';
import { AccountPage } from './pages/AccountPage';
import { AuctionDetailPage } from './pages/AuctionDetailPage';
import { AuctionListPage } from './pages/AuctionListPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { DepositPage } from './pages/DepositPage';
import { MyBidsPage } from './pages/MyBidsPage';
import { MyWinsPage } from './pages/MyWinsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { RegisterPage } from './pages/RegisterPage';
import { SignInPage } from './pages/SignInPage';
import { WalletPage } from './pages/WalletPage';
import { WinnersPage } from './pages/WinnersPage';
import { createQueryClient } from './queryClient';

/** Everything except the router, so tests can mount it at any address. */
export function App({ queryClient }: { queryClient?: QueryClient }) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <LanguageProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route element={<PublicPages />}>
                <Route index element={<AuctionListPage />} />
                <Route path="auctions/:id" element={<AuctionDetailPage />} />
                <Route path="winners" element={<WinnersPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
              <Route element={<GuestOnly />}>
                <Route path="sign-in" element={<SignInPage />} />
                <Route path="register" element={<RegisterPage />} />
              </Route>
              <Route element={<RequireAuth />}>
                <Route path="wallet" element={<WalletPage />} />
                <Route path="wallet/deposits/:id" element={<DepositPage />} />
                <Route path="bids" element={<MyBidsPage />} />
                <Route path="wins" element={<MyWinsPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="account" element={<AccountPage />} />
                <Route path="change-password" element={<ChangePasswordPage />} />
              </Route>
            </Route>
          </Routes>
        </LanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
