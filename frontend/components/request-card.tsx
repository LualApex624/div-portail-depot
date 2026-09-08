'use client';

import { Box, HStack, Stack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';
import { DivCard } from '@/components/ui/card';
import { CountPill, StatusBadge } from '@/components/ui/status-badge';
import { formatDate, formatRemaining } from '@/lib/format';
import type { RequestSummary } from '@/lib/types';

/**
 * Carte de demande du dashboard.
 *
 * Reprend la maquette : intitule, date de creation et delai restant, statut,
 * compteur de pieces. Le lien n'y figure pas, et c'est une consequence
 * assumee du modele : seule l'empreinte du token est conservee, il n'est donc
 * pas re-affichable apres la creation.
 */
export function RequestCard({ request }: { request: RequestSummary }) {
  return (
    <NextLink href={`/avocat/demandes/${request.id}`}>
      <DivCard
        transition="border-color 0.18s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1)"
        _hover={{ borderColor: 'secondary', bg: 'fondAccent' }}
      >
        <Stack gap="12px">
          <HStack justify="space-between" align="flex-start" gap="12px">
            <Text fontSize="17px" fontWeight="600" truncate title={request.title}>
              {request.title}
            </Text>
            <Box flexShrink={0}>
              <StatusBadge status={request.status} />
            </Box>
          </HStack>

          <Text fontSize="14px" color="gris">
            Cree le {formatDate(request.createdAt)}, {formatRemaining(request.expiresAt)}
          </Text>

          <HStack justify="space-between" gap="12px">
            <CountPill count={request.acceptedCount} />
            <Text fontSize="14px" color="primary" fontWeight="600">
              Voir le detail
            </Text>
          </HStack>
        </Stack>
      </DivCard>
    </NextLink>
  );
}
