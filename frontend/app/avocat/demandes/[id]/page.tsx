'use client';

import { Box, HStack, Heading, Stack, Text } from '@chakra-ui/react';
import { Pressable } from '@/components/ui/pressable';
import NextLink from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { DivCard } from '@/components/ui/card';
import { GhostButton } from '@/components/ui/buttons';
import { FileStatusBadge, StatusBadge } from '@/components/ui/status-badge';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toaster';
import { Reveal } from '@/components/ui/reveal';
import { api, ApiError } from '@/lib/api';
import { formatBytes, formatDateTime, formatRemaining, shortMimeLabel } from '@/lib/format';
import type { RequestDetail } from '@/lib/types';

export default function RequestDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await api.getRequest(params.id));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.replace('/avocat/login');
        return;
      }
      setError(
        caught instanceof ApiError && caught.status === 404
          ? 'Cette demande n existe pas ou ne vous appartient pas.'
          : 'Impossible de charger cette demande.',
      );
    } finally {
      setLoading(false);
    }
  }, [params.id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Le telechargement passe par une URL signee valable 60 s, obtenue au clic.
   * Le fichier vient donc du stockage objet, pas de l'API, et l'URL n'est
   * jamais rendue dans le HTML ou copiable depuis la page.
   */
  const download = async (fileId: string) => {
    setDownloading(fileId);
    try {
      const { url } = await api.downloadUrl(params.id, fileId);
      window.location.assign(url);
    } catch {
      toast({ title: 'Telechargement impossible', tone: 'error' });
    } finally {
      setDownloading(null);
    }
  };

  return (
    <AppShell
      href="/avocat/demandes"
      action={
        <NextLink href="/avocat/demandes">
          <GhostButton py="9px" px="18px" fontSize="14px">
            Retour
          </GhostButton>
        </NextLink>
      }
    >
      {loading ? (
        <LoadingState label="Chargement de la demande..." />
      ) : error || !detail ? (
        <ErrorState
          description={error ?? 'Demande introuvable.'}
          action={
            <NextLink href="/avocat/demandes">
              <GhostButton>Revenir au dashboard</GhostButton>
            </NextLink>
          }
        />
      ) : (
        <Reveal>
          <Stack gap="20px">
            <Stack gap="10px">
              <HStack justify="space-between" align="flex-start" gap="12px" flexWrap="wrap">
                <Heading as="h1" fontSize={{ base: '22px', md: '27px' }} fontWeight="600">
                  {detail.title}
                </Heading>
                <StatusBadge status={detail.status} />
              </HStack>
              <Text fontSize="15px" color="gris">
                Creee le {formatDateTime(detail.createdAt)} — {formatRemaining(detail.expiresAt)}
              </Text>
              {detail.purgedAt ? (
                <Text fontSize="14px" color="gris">
                  Pieces detruites le {formatDateTime(detail.purgedAt)} conformement a
                  l&apos;expiration du lien.
                </Text>
              ) : null}
            </Stack>

            {detail.files.length === 0 ? (
              <EmptyState
                title={detail.purgedAt ? 'Pieces detruites' : 'Aucune piece deposee'}
                description={
                  detail.purgedAt
                    ? 'Le lien a expire : les fichiers et leurs metadonnees ont ete supprimes. Seule la trace horodatee subsiste dans le journal d audit.'
                    : 'Votre client n a pas encore depose de piece. Le statut se met a jour des la premiere reception.'
                }
              />
            ) : (
              <DivCard p="0">
                <Box px={{ base: '16px', md: '24px' }} pt="20px" pb="4px">
                  <Text fontSize="15px" fontWeight="600">
                    Pieces recues
                  </Text>
                </Box>
                <Box px={{ base: '16px', md: '24px' }} pb="8px">
                  {detail.files.map((file) => (
                    <Box key={file.id} borderTopWidth="1px" borderColor="bordure" py="14px">
                      <HStack justify="space-between" gap="16px" align="flex-start">
                        <HStack gap="12px" minW={0} flex="1" align="flex-start">
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
                            {shortMimeLabel(file.mimeType)}
                          </Box>
                          <Stack gap="2px" minW={0}>
                            <Text fontSize="15px" truncate title={file.filename}>
                              {file.filename}
                            </Text>
                            <Text fontSize="13px" color="gris">
                              {formatBytes(file.size)}
                              {file.completedAt ? ` — ${formatDateTime(file.completedAt)}` : ''}
                            </Text>
                            {file.rejectionReason ? (
                              <Text fontSize="13px" color="dangerFg">
                                {file.rejectionReason}
                              </Text>
                            ) : null}
                          </Stack>
                        </HStack>

                        <HStack gap="10px" flexShrink={0}>
                          <FileStatusBadge status={file.status} />
                          {file.status === 'ACCEPTED' && !detail.purgedAt ? (
                            <Pressable
                              type="button"
                              onClick={() => void download(file.id)}
                              disabled={downloading === file.id}
                              color="primary"
                              fontWeight="600"
                              fontSize="14px"
                              px="10px"
                              py="4px"
                              borderRadius="divFull"
                              _hover={{ bg: 'fondAccent' }}
                              _focusVisible={{
                                outline: '2px solid',
                                outlineColor: 'primary',
                                outlineOffset: '2px',
                              }}
                            >
                              {downloading === file.id ? '...' : 'Telecharger'}
                            </Pressable>
                          ) : null}
                        </HStack>
                      </HStack>
                    </Box>
                  ))}
                </Box>
              </DivCard>
            )}
          </Stack>
        </Reveal>
      )}
    </AppShell>
  );
}
