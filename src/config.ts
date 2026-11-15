export const config = {
  appName: 'LUB Auction',
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
} as const;
