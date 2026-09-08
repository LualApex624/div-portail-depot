'use client';

import { ChakraProvider } from '@chakra-ui/react';
import { ToastProvider } from '@/components/ui/toaster';
import { system } from '@/theme';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ChakraProvider value={system}>
      <ToastProvider>{children}</ToastProvider>
    </ChakraProvider>
  );
}
