import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'บันทึกการเข้าพัก — TMC',
  description: 'TMC Management — บันทึกการเข้าพักผ่านมือถือ',
};

export default function TmcCheckinLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="bg-slate-50 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
