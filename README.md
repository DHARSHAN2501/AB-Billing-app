# Smart Restaurant - Billing & Cashier POS Console 💵

High-speed billing counter and cashier console for restaurant cashiers.

## Features
- 🔍 Fast order lookup by Order Number, Table Number, or Customer Name
- 🧾 Real-time itemized bill breakdown with automatic 5% GST calculation
- 🛡️ Dual-cashier race-condition protection (prevents double settling)
- 🖨️ Printable thermal receipt formatting
- 🚫 Auto-hiding and void payment disabling for cancelled orders
- 🚚 Visual indicators for Dine-in vs Home Delivery settlement

## Setup & Running
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment:
   ```bash
   copy .env.example .env
   ```
   Add your Supabase URL and Anon Key.
3. Start development server (Port 3004):
   ```bash
   npm run dev
   ```
4. Build for production:
   ```bash
   npm run build
   ```
