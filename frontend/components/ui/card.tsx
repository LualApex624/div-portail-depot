'use client';

import { Box, BoxProps } from '@chakra-ui/react';

/**
 * Carte de la charte : fond blanc, bordure 1 px #E9E9E9, radius 12 px,
 * et surtout aucune ombre. C'est le repere de densite du site.
 */
export function DivCard({ children, ...props }: BoxProps) {
  return (
    <Box
      bg="white"
      borderWidth="1px"
      borderColor="bordure"
      borderRadius="div12"
      p={{ base: '20px', md: '24px' }}
      {...props}
    >
      {children}
    </Box>
  );
}
