'use client';

import { Box, HStack, Spinner, Stack, Text, VStack } from '@chakra-ui/react';
import { DivCard } from '@/components/ui/card';

/**
 * Etats vide, chargement et erreur.
 *
 * Regroupes ici pour qu'ils soient toujours traites, et traites pareil :
 * la charte demande explicitement de ne jamais laisser un ecran blanc sans
 * explication.
 */

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <DivCard py="48px">
      <VStack gap="10px" textAlign="center">
        <Box
          w="44px"
          h="44px"
          borderRadius="divFull"
          bg="fondAccent"
          color="primary"
          display="flex"
          alignItems="center"
          justifyContent="center"
          fontSize="22px"
          fontWeight="600"
          mb="4px"
        >
          +
        </Box>
        <Text fontSize="18px" fontWeight="600">
          {title}
        </Text>
        <Text fontSize="15px" color="gris" maxW="420px">
          {description}
        </Text>
        {action ? <Box pt="12px">{action}</Box> : null}
      </VStack>
    </DivCard>
  );
}

export function LoadingState({ label = 'Chargement...' }: { label?: string }) {
  return (
    <DivCard py="48px">
      <HStack gap="12px" justify="center" color="gris">
        <Spinner size="sm" color="primary" />
        <Text fontSize="15px">{label}</Text>
      </HStack>
    </DivCard>
  );
}

export function ErrorState({
  title = 'Une erreur est survenue',
  description,
  action,
}: {
  title?: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <DivCard borderColor="dangerBg" bg="dangerBg" py="32px">
      <Stack gap="8px" textAlign="center" align="center">
        <Text fontSize="17px" fontWeight="600" color="dangerFg">
          {title}
        </Text>
        <Text fontSize="15px" color="gris" maxW="440px">
          {description}
        </Text>
        {action ? <Box pt="8px">{action}</Box> : null}
      </Stack>
    </DivCard>
  );
}

/** Squelette de liste : evite le saut de mise en page au chargement. */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <Stack gap="16px">
      {Array.from({ length: rows }).map((_, index) => (
        <DivCard key={index}>
          <Stack gap="10px">
            <Box h="18px" w="45%" bg="bordure" borderRadius="div4" />
            <Box h="14px" w="70%" bg="bordure" borderRadius="div4" opacity={0.6} />
          </Stack>
        </DivCard>
      ))}
    </Stack>
  );
}
