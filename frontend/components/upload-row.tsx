'use client';

import { Box, HStack, Text, VStack } from '@chakra-ui/react';
import { FileStatusBadge } from '@/components/ui/status-badge';
import { formatBytes, shortMimeLabel } from '@/lib/format';
import type { FileStatus } from '@/lib/types';

export interface UploadItem {
  key: string;
  filename: string;
  size: number;
  mimeType: string;
  /** 'uploading' n'existe que cote client : le serveur ne connait que PENDING. */
  state: 'uploading' | 'verifying' | FileStatus;
  progress: number;
  error?: string;
}

/**
 * Une ligne par piece, action a droite, comme la maquette.
 *
 * Trois etats distincts sont montres et non fondus en un seul : le transfert
 * (avec son pourcentage), la verification serveur (le type reel est controle
 * apres reception), puis le resultat. C'est ce qui rend l'echec lisible.
 */
export function UploadRow({ item }: { item: UploadItem }) {
  // Narrowing explicite : 'uploading' et 'verifying' sont des etats purement
  // client, le badge ne connait que les statuts renvoyes par le serveur.
  const serverStatus: FileStatus | null =
    item.state === 'uploading' || item.state === 'verifying' ? null : item.state;
  const inProgress = serverStatus === null;

  return (
    <Box borderTopWidth="1px" borderColor="bordure" py="14px">
      <HStack justify="space-between" align="flex-start" gap="16px">
        <HStack gap="12px" align="flex-start" minW={0} flex="1">
          <Box
            bg="fondAccent"
            color="primary"
            fontSize="11px"
            fontWeight="600"
            px="8px"
            py="4px"
            borderRadius="div4"
            flexShrink={0}
          >
            {shortMimeLabel(item.mimeType)}
          </Box>
          <VStack align="stretch" gap="2px" minW={0} flex="1">
            <Text fontSize="15px" truncate title={item.filename}>
              {item.filename}
            </Text>
            <Text fontSize="13px" color="gris">
              {formatBytes(item.size)}
              {item.state === 'uploading' ? ` — ${item.progress}%` : ''}
              {item.state === 'verifying' ? ' — verification du format' : ''}
            </Text>
            {item.error ? (
              <Text fontSize="13px" color="dangerFg" mt="2px">
                {item.error}
              </Text>
            ) : null}
          </VStack>
        </HStack>

        <Box flexShrink={0} pt="2px">
          {inProgress ? (
            <Text fontSize="13px" color="gris" fontWeight="600">
              {item.state === 'uploading' ? `${item.progress}%` : '...'}
            </Text>
          ) : serverStatus ? (
            <FileStatusBadge status={serverStatus} />
          ) : null}
        </Box>
      </HStack>

      {inProgress ? (
        <Box mt="10px" h="4px" bg="bordure" borderRadius="divFull" overflow="hidden">
          <Box
            h="full"
            bg="primary"
            borderRadius="divFull"
            width={`${item.state === 'verifying' ? 100 : item.progress}%`}
            transition="width 0.25s cubic-bezier(0.22, 1, 0.36, 1)"
            opacity={item.state === 'verifying' ? 0.5 : 1}
          />
        </Box>
      ) : null}
    </Box>
  );
}
