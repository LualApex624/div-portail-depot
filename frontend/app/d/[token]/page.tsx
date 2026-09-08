'use client';

import { Box, Heading, Stack, Text } from '@chakra-ui/react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { DivCard } from '@/components/ui/card';
import { PinInput } from '@/components/pin-input';
import { DepositWorkspace } from '@/components/deposit-workspace';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Reveal } from '@/components/ui/reveal';
import { api, ApiError } from '@/lib/api';
import type { DepositView, LinkAvailability } from '@/lib/types';

type Screen =
  | { name: 'loading' }
  | { name: 'pin'; availability: LinkAvailability }
  | { name: 'deposit'; view: DepositView }
  | { name: 'unavailable'; reason: LinkAvailability };

/**
 * Parcours client : un seul ecran, deux etats.
 *
 * Le client n'a pas de compte. Il arrive avec un lien, saisit un code, depose.
 * Rien d'autre ne doit lui etre demande.
 */
export default function DepositPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [pinError, setPinError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);

  const bootstrap = useCallback(async () => {
    // Une session de depot ouverte survit au rechargement de la page : on la
    // tente d'abord, pour ne pas redemander le PIN sans raison.
    try {
      setScreen({ name: 'deposit', view: await api.depositSession(token) });
      return;
    } catch {
      // Pas de session valide : parcours normal.
    }

    try {
      const { status } = await api.describeLink(token);
      setScreen(
        status === 'AVAILABLE'
          ? { name: 'pin', availability: status }
          : { name: 'unavailable', reason: status },
      );
    } catch {
      setScreen({ name: 'unavailable', reason: 'UNAVAILABLE' });
    }
  }, [token]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const handleUnlock = async (pin: string) => {
    setVerifying(true);
    setPinError(null);

    try {
      setScreen({ name: 'deposit', view: await api.unlock(token, pin) });
    } catch (caught) {
      const status = caught instanceof ApiError ? caught.status : 0;

      if (status === 403) {
        setScreen({ name: 'unavailable', reason: 'LOCKED' });
        return;
      }

      setPinError(
        status === 0
          ? 'Service indisponible. Reessayez dans un instant.'
          : 'Code incorrect ou lien expire.',
      );
      setResetSignal((current) => current + 1);
    } finally {
      setVerifying(false);
    }
  };

  if (screen.name === 'loading') {
    return (
      <AppShell>
        <Box maxW="480px" mx="auto">
          <LoadingState label="Verification du lien..." />
        </Box>
      </AppShell>
    );
  }

  if (screen.name === 'unavailable') {
    return (
      <AppShell>
        <Box maxW="480px" mx="auto" pt={{ base: '8px', md: '32px' }}>
          <ErrorState
            title={screen.reason === 'LOCKED' ? 'Acces temporairement bloque' : 'Lien indisponible'}
            description={
              screen.reason === 'LOCKED'
                ? 'Trop de codes incorrects ont ete saisis. Reessayez dans une quinzaine de minutes, ou demandez un nouveau lien a votre avocat.'
                : 'Ce lien est expire ou n est plus valide. Les pieces associees ont ete supprimees. Demandez un nouveau lien a votre avocat.'
            }
          />
        </Box>
      </AppShell>
    );
  }

  if (screen.name === 'deposit') {
    return <DepositWorkspace token={token} initialView={screen.view} />;
  }

  return (
    <AppShell>
      <Box maxW="480px" mx="auto" pt={{ base: '8px', md: '32px' }}>
        <Reveal>
          <Stack gap="8px" mb="24px" textAlign="center">
            <Heading as="h1" fontSize={{ base: '24px', md: '30px' }} fontWeight="600">
              Deposer des pieces
            </Heading>
            <Text fontSize="15px" color="gris">
              Saisissez le code a 8 chiffres transmis par votre avocat.
            </Text>
          </Stack>

          <DivCard>
            <Stack gap="18px" align="center">
              <PinInput
                onComplete={handleUnlock}
                disabled={verifying}
                invalid={Boolean(pinError)}
                resetSignal={resetSignal}
              />

              {verifying ? (
                <Text fontSize="14px" color="gris">
                  Verification...
                </Text>
              ) : pinError ? (
                <Text fontSize="14px" color="dangerFg" textAlign="center" role="alert">
                  {pinError}
                </Text>
              ) : (
                <Text fontSize="14px" color="gris" textAlign="center">
                  Le depot s ouvre automatiquement des les 8 chiffres saisis.
                </Text>
              )}
            </Stack>
          </DivCard>

          <Text fontSize="13px" color="gris" textAlign="center" mt="16px">
            Le code vous a ete communique separement du lien. Ne le transmettez a personne.
          </Text>
        </Reveal>
      </Box>
    </AppShell>
  );
}
