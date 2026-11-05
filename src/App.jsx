import React from 'react';
import { BillingConsole } from './pages/BillingConsole';

function App() {
  React.useEffect(() => {
    document.title = 'Billing POS - Arunachala Bhavan';
    let link = document.querySelector("link[rel*='icon']");
    if (link) {
      link.href = '/favicon.png?v=2';
      link.type = 'image/png';
    }
  }, []);

  return <BillingConsole />;
}

export default App;
