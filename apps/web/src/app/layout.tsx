import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '../context/auth-context';
import { Navbar } from '../components/navbar';

export const metadata: Metadata = {
  title: 'پلتفرم جامع عضویت چندباشگاهی | Gravity Fitness',
  description: 'شبکه یکپارچه دسترسی به مجموعه‌ها و باشگاه‌های ورزشی منتخب با سیستم اعتباری پویا',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fa" dir="rtl" className="overflow-x-hidden">
      <body className="min-h-screen bg-[#0D0F10] text-[#F4F5F2] antialiased font-persian overflow-x-hidden">
        <AuthProvider>
          <div className="flex min-h-screen flex-col bg-[#0D0F10] text-[#F4F5F2]">
            <Navbar />
            <main className="flex-1 pb-16">{children}</main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
