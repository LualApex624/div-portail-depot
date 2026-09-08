'use client';

import { Box, Heading, Stack, Text } from '@chakra-ui/react';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { DivCard } from '@/components/ui/card';
import { PrimaryButton } from '@/components/ui/buttons';
import { TextField } from '@/components/ui/text-field';
import { Reveal } from '@/components/ui/reveal';
import { api, ApiError } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await api.login(email, password);
      router.push('/avocat/demandes');
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 0
          ? 'Service indisponible. Reessayez dans un instant.'
          : 'Identifiants invalides.',
      );
      setSubmitting(false);
    }
  };

  return (
    <AppShell href="/avocat/login">
      <Box maxW="420px" mx="auto" pt={{ base: '8px', md: '32px' }}>
        <Reveal>
          <Stack gap="8px" mb="24px">
            <Heading as="h1" fontSize={{ base: '26px', md: '30px' }} fontWeight="600">
              Espace avocat
            </Heading>
            <Text fontSize="15px" color="gris">
              Connectez-vous pour creer une demande de depot et suivre vos dossiers.
            </Text>
          </Stack>

          <DivCard>
            <form onSubmit={handleSubmit} noValidate>
              <Stack gap="18px">
                <TextField
                  label="Adresse e-mail"
                  type="email"
                  name="email"
                  autoComplete="username"
                  placeholder="prenom.nom@cabinet.fr"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                <TextField
                  label="Mot de passe"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  placeholder="********"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  error={error ?? undefined}
                  required
                />
                <PrimaryButton type="submit" w="full" loading={submitting} loadingText="Connexion">
                  Se connecter
                </PrimaryButton>
              </Stack>
            </form>
          </DivCard>
        </Reveal>
      </Box>
    </AppShell>
  );
}
