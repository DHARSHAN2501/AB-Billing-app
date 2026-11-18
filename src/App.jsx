import React from 'react';
import { BillingConsole } from './pages/BillingConsole';
import { ToastContainer } from './components/Toast';
import { AuthGuard } from './components/AuthGuard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { STAFF_ROLES } from './services/authService';

function App() {
  React.useEffect(() => {
    document.title = 'Billing POS - Arunachala Bhavan';
    let link = document.querySelector("link[rel='icon'][sizes='192x192']") || document.querySelector("link[rel='icon']");
    if (link) {
      link.href = '/icon-192.png?v=3';
      link.type = 'image/png';
    }
  }, []);

  return (
    <ErrorBoundary>
      <AuthGuard requiredRole={STAFF_ROLES.CASHIER} appTitle="Billing POS — Arunachala Bhavan">
        <BillingConsole />
        <ToastContainer />
      </AuthGuard>
    </ErrorBoundary>
  );
}

export default App;
