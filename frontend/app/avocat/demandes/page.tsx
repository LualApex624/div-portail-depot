'use client';

import { Box, HStack, Heading, Stack, Text } from '@chakra-ui/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { CreateRequestDialog } from '@/components/create-request-dialog';
import { RequestCard } from '@/components/request-card';
import { GhostButton, PrimaryButton } from '@/components/ui/buttons';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { Reveal } from '@/components/ui/reveal';
import { api, ApiError } from '@/lib/api';
import type { AuthenticatedUser, RequestPage } from '@/lib/types';

const PAGE_SIZE = 9;

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RequestPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const [me, requests] = await Promise.all([
          api.me(),
          api.listRequests(targetPage, PAGE_SIZE),
        ]);
        setUser(me.user);
        setData(requests);
      } catch (caught) {
        // Session expiree : on renvoie au login plutot que d'afficher une
        // erreur que l'avocat ne peut pas resoudre depuis cet ecran.
        if (caught instanceof ApiError && caught.status === 401) {
          router.replace('/avocat/login');
          return;
        }
        setError('Impossible de charger vos demandes.');
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const logout = async () => {
    await api.logout().catch(() => undefined);
    router.replace('/avocat/login');
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <AppShell
      href="/avocat/demandes"
      action={
        <HStack gap="10px">
          <Text fontSize="14px" color="gris" display={{ base: 'none', md: 'block' }}>
            {user?.displayName ?? ''}
          </Text>
          <GhostButton onClick={logout} py="9px" px="18px" fontSize="14px">
            Deconnexion
          </GhostButton>
        </HStack>
      }
    >
      <Stack gap="24px">
        <HStack justify="space-between" align="flex-end" gap="16px" flexWrap="wrap">
          <Stack gap="4px">
            <Heading as="h1" fontSize={{ base: '24px', md: '28px' }} fontWeight="600">
              Demandes de depot
            </Heading>
            <Text fontSize="15px" color="gris">
              {data ? `${data.total} demande${data.total > 1 ? 's' : ''}` : 'Chargement...'}
            </Text>
          </Stack>
          <PrimaryButton onClick={() => setDialogOpen(true)}>Creer une demande</PrimaryButton>
        </HStack>

        {loading ? (
          <SkeletonRows rows={3} />
        ) : error ? (
          <ErrorState
            description={error}
            action={<GhostButton onClick={() => void load(page)}>Reessayer</GhostButton>}
          />
        ) : data && data.items.length === 0 ? (
          <EmptyState
            title="Aucune demande en cours"
            description="Cree une demande pour recevoir des pieces de ton client."
            action={
              <PrimaryButton onClick={() => setDialogOpen(true)}>Creer une demande</PrimaryButton>
            }
          />
        ) : (
          <>
            <Box
              display="grid"
              gridTemplateColumns={{ base: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }}
              gap="16px"
            >
              {data?.items.map((request, index) => (
                <Reveal key={request.id} delay={Math.min(index, 5) * 60}>
                  <RequestCard request={request} />
                </Reveal>
              ))}
            </Box>

            {totalPages > 1 ? (
              <HStack justify="center" gap="12px" pt="8px">
                <GhostButton
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                  py="9px"
                  fontSize="14px"
                >
                  Precedent
                </GhostButton>
                <Text fontSize="14px" color="gris">
                  Page {page} sur {totalPages}
                </Text>
                <GhostButton
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  py="9px"
                  fontSize="14px"
                >
                  Suivant
                </GhostButton>
              </HStack>
            ) : null}
          </>
        )}
      </Stack>

      <CreateRequestDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => {
          setPage(1);
          void load(1);
        }}
      />
    </AppShell>
  );
}
