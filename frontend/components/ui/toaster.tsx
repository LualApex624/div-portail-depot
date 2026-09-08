'use client';

import { Box, Stack, Text } from '@chakra-ui/react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

const TONES: Record<ToastTone, { fg: string; bg: string }> = {
  success: { fg: 'successFg', bg: 'successBg' },
  error: { fg: 'dangerFg', bg: 'dangerBg' },
  info: { fg: 'infoFg', bg: 'infoBg' },
};

const ToastContext = createContext<(toast: Omit<Toast, 'id'>) => void>(() => undefined);

export const useToast = () => useContext(ToastContext);

/**
 * Notifications legeres.
 *
 * Ecrit a la main plutot qu'importe : le rendu doit suivre les couleurs
 * semantiques de la charte au pixel pres, et l'enonce demande un toast, pas
 * une alerte modale. Une trentaine de lignes evitent d'habiller un composant
 * generique pour le faire ressembler a autre chose.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = (nextId.current += 1);
    setToasts((current) => [...current, { ...toast, id }]);
    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 5000);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Stack
        position="fixed"
        bottom={{ base: '16px', md: '24px' }}
        right={{ base: '16px', md: '24px' }}
        left={{ base: '16px', md: 'auto' }}
        gap="8px"
        zIndex={1400}
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <Box
            key={toast.id}
            bg={TONES[toast.tone].bg}
            color={TONES[toast.tone].fg}
            borderRadius="div8"
            px="16px"
            py="12px"
            maxW={{ base: 'full', md: '360px' }}
            animation="divReveal 0.55s cubic-bezier(0.22, 1, 0.36, 1)"
          >
            <Text fontWeight="600" fontSize="14px">
              {toast.title}
            </Text>
            {toast.description ? (
              <Text fontSize="13px" color="gris" mt="2px">
                {toast.description}
              </Text>
            ) : null}
          </Box>
        ))}
      </Stack>
    </ToastContext.Provider>
  );
}
