'use client';

import { Box, Dialog, Heading, Portal, Stack, Text } from '@chakra-ui/react';
import { Pressable } from '@/components/ui/pressable';
import { FormEvent, useState } from 'react';
import { GhostButton, PrimaryButton } from '@/components/ui/buttons';
import { TextField } from '@/components/ui/text-field';
import { CopyField } from '@/components/ui/copy-field';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { CreatedRequest } from '@/lib/types';

const DURATIONS = [
  { hours: 24, label: '24 heures' },
  { hours: 48, label: '48 heures' },
  { hours: 72, label: '72 heures' },
  { hours: 168, label: '7 jours' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Creation d'une demande, puis remise des secrets.
 *
 * Le second ecran est volontairement bloquant : ni Echap, ni clic exterieur
 * ne le ferment. Le lien et le PIN n'existent en clair qu'a cet instant — la
 * base ne conserve que leurs empreintes — donc fermer par inadvertance
 * signifie recreer la demande. La fermeture demande une confirmation
 * explicite, et le libelle le dit.
 */
export function CreateRequestDialog({ open, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [hours, setHours] = useState(72);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedRequest | null>(null);
  const [pinRevealed, setPinRevealed] = useState(false);

  const reset = () => {
    setTitle('');
    setHours(72);
    setCreated(null);
    setError(null);
    setPinRevealed(false);
    setSubmitting(false);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (title.trim().length < 3) {
      setError('L intitule doit comporter au moins 3 caracteres.');
      return;
    }

    setSubmitting(true);
    try {
      setCreated(await api.createRequest(title.trim(), hours));
      onCreated();
    } catch {
      setError('Creation impossible. Reessayez.');
    } finally {
      setSubmitting(false);
    }
  };

  const finish = () => {
    reset();
    onClose();
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(event) => {
        if (!event.open && !created) {
          reset();
          onClose();
        }
      }}
      closeOnInteractOutside={!created}
      closeOnEscape={!created}
      placement="center"
    >
      <Portal>
        <Dialog.Backdrop bg="blackAlpha.500" />
        <Dialog.Positioner p="16px">
          <Dialog.Content
            bg="white"
            borderRadius="div12"
            borderWidth="1px"
            borderColor="bordure"
            boxShadow="none"
            maxW="480px"
            w="full"
            p={{ base: '20px', md: '28px' }}
          >
            {created ? (
              <Stack gap="20px">
                <Stack gap="6px">
                  <Heading as="h2" fontSize="21px" fontWeight="600">
                    Demande creee
                  </Heading>
                  <Text fontSize="15px" color="gris">
                    Transmettez le lien et le code par deux canaux differents. Le code n&apos;est
                    affiche qu&apos;une fois : il ne sera plus consultable ensuite.
                  </Text>
                </Stack>

                <CopyField label="Lien genere" value={created.url} monospace />

                {pinRevealed ? (
                  <CopyField label="Code PIN" value={created.pin} spaced />
                ) : (
                  <Box>
                    <Text
                      fontSize="13px"
                      color="gris"
                      mb="6px"
                      textTransform="uppercase"
                      letterSpacing="0.04em"
                    >
                      Code PIN
                    </Text>
                    <Pressable
                      type="button"
                      w="full"
                      onClick={() => setPinRevealed(true)}
                      borderWidth="1px"
                      borderColor="bordure"
                      borderRadius="div8"
                      bg="fondAccent"
                      color="primary"
                      fontWeight="600"
                      fontSize="15px"
                      py="14px"
                      _hover={{ bg: 'accentSoft' }}
                      _focusVisible={{
                        outline: '2px solid',
                        outlineColor: 'primary',
                        outlineOffset: '2px',
                      }}
                    >
                      Afficher le code a 8 chiffres
                    </Pressable>
                  </Box>
                )}

                <Text fontSize="13px" color="gris">
                  {created.title} — expire le {formatDateTime(created.expiresAt)}.
                </Text>

                <PrimaryButton w="full" onClick={finish}>
                  J&apos;ai transmis le lien et le code
                </PrimaryButton>
              </Stack>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <Stack gap="20px">
                  <Heading as="h2" fontSize="21px" fontWeight="600">
                    Creer une demande
                  </Heading>

                  <TextField
                    label="Intitule du dossier"
                    placeholder="Dossier Martin, pieces 2026"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    error={error ?? undefined}
                    maxLength={120}
                    autoFocus
                  />

                  <Box>
                    <Text fontSize="14px" fontWeight="600" mb="8px">
                      Duree de validite
                    </Text>
                    <Box display="flex" flexWrap="wrap" gap="8px">
                      {DURATIONS.map((duration) => {
                        const selected = hours === duration.hours;
                        return (
                          <Pressable
                            type="button"
                            key={duration.hours}
                            onClick={() => setHours(duration.hours)}
                            aria-pressed={selected}
                            px="16px"
                            py="9px"
                            fontSize="14px"
                            fontWeight="600"
                            borderRadius="divFull"
                            bg={selected ? 'primary' : 'white'}
                            color={selected ? 'white' : 'gris'}
                            boxShadow={
                              selected ? 'none' : 'inset 0 0 0 1px var(--chakra-colors-bordure)'
                            }
                            transition="background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1)"
                            _hover={selected ? undefined : { bg: 'fondAccent', color: 'primary' }}
                            _focusVisible={{
                              outline: '2px solid',
                              outlineColor: 'primary',
                              outlineOffset: '2px',
                            }}
                          >
                            {duration.label}
                          </Pressable>
                        );
                      })}
                    </Box>
                  </Box>

                  <Box display="flex" gap="10px" justifyContent="flex-end" flexWrap="wrap">
                    <GhostButton
                      type="button"
                      onClick={() => {
                        reset();
                        onClose();
                      }}
                    >
                      Annuler
                    </GhostButton>
                    <PrimaryButton type="submit" loading={submitting} loadingText="Creation">
                      Creer une demande
                    </PrimaryButton>
                  </Box>
                </Stack>
              </form>
            )}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
