import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui';

/**
 * Keeps a page that fails to draw from taking the header and navigation down with it.
 * Give it a `key` that changes with the address, so moving to another page tries again.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Page failed to render', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="py-16 text-center">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-slate-600">
          This page could not be shown. Reload it, and if that does not help, please try again later.
        </p>
        <Button className="mt-6" onClick={() => window.location.reload()}>
          Reload the page
        </Button>
      </div>
    );
  }
}
