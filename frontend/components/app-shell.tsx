'use client';

import { Box, Container, HStack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';

/**
 * Cadre commun des ecrans.
 *
 * En-tete sobre, une seule action a droite. Ton de marque : formel, froid,
 * technique. Pas d'illustration, pas de mascotte.
 */
export function AppShell({
  children,
  action,
  href = '/',
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  href?: string;
}) {
  return (
    <Box minH="100dvh" bg="white" display="flex" flexDirection="column">
      <Box as="header" borderBottomWidth="1px" borderColor="bordure">
        <Container maxW="1080px" px={{ base: '16px', md: '24px' }}>
          <HStack h="64px" justify="space-between" gap="16px">
            <NextLink href={href}>
              <HStack gap="10px">
                <Box w="10px" h="10px" borderRadius="divFull" bg="primary" />
                <Text fontWeight="600" fontSize="15px" letterSpacing="-0.01em">
                  DIV Protocol
                </Text>
                <Text
                  fontSize="15px"
                  color="gris"
                  display={{ base: 'none', sm: 'block' }}
                  fontWeight="400"
                >
                  Depot de pieces
                </Text>
              </HStack>
            </NextLink>
            {action}
          </HStack>
        </Container>
      </Box>

      <Box as="main" flex="1" py={{ base: '24px', md: '40px' }}>
        <Container maxW="1080px" px={{ base: '16px', md: '24px' }}>
          {children}
        </Container>
      </Box>

      <Box as="footer" borderTopWidth="1px" borderColor="bordure" py="20px">
        <Container maxW="1080px" px={{ base: '16px', md: '24px' }}>
          <Text fontSize="13px" color="gris">
            Les pieces sont supprimees automatiquement a l&apos;expiration du lien.
          </Text>
        </Container>
      </Box>
    </Box>
  );
}
