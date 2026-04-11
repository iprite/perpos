import { inter, lexendDeca } from '@core/fonts';
import { siteConfig } from '@/config/site.config';
import CarbonLayout from '@/layouts/carbon/carbon-layout';
import { Providers } from '@core/providers';
import cn from '@core/utils/class-names';
import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Isomorphic DnD Template',
  description: 'A template for building isomorphic drag and drop applications.',
  icons: '/logo-short-light.svg',
};

export default function RootLayout({ children }: { children: React.ReactNode }){
  return (
    <html
      // 💡 Prevent next-themes hydration warning
      suppressHydrationWarning
    >
      <body
        // to prevent any warning that is caused by third party extensions like Grammarly
        suppressHydrationWarning
        className={cn(inter.variable, lexendDeca.variable, 'font-inter')}
      >
        <Providers defaultTheme={String(siteConfig.mode)}>
          <CarbonLayout>{children}</CarbonLayout>
        </Providers>
      </body>
    </html>
  );
}
