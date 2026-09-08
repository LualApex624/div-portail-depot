'use client';

import { Box, HStack, Heading, Stack, Text } from '@chakra-ui/react';
import { useCallback, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { DivCard } from '@/components/ui/card';
import { FileDropzone } from '@/components/file-dropzone';
import { UploadRow, UploadItem } from '@/components/upload-row';
import { Reveal } from '@/components/ui/reveal';
import { useToast } from '@/components/ui/toaster';
import { api, ApiError, uploadToStorage } from '@/lib/api';
import { formatBytes, formatRemaining } from '@/lib/format';
import type { DepositView } from '@/lib/types';

/**
 * Ecran de depot, une fois le PIN valide.
 *
 * Le transfert se fait en trois temps, et chacun est visible a l'ecran :
 *   1. `init`     : l'API valide taille, type declare et quota, puis signe ;
 *   2. `PUT`      : le navigateur envoie l'octet directement au stockage ;
 *   3. `complete` : l'API verifie le type reel et promeut la piece.
 *
 * Les fichiers sont traites en serie et non en parallele : sur une connexion
 * mobile, trois transferts concurrents rendent chaque barre de progression
 * erratique, et un echec partiel devient illisible.
 */
export function DepositWorkspace({
  token,
  initialView,
}: {
  token: string;
  initialView: DepositView;
}) {
  const toast = useToast();
  const [view, setView] = useState(initialView);
  const [items, setItems] = useState<UploadItem[]>(() =>
    initialView.files.map((file) => ({
      key: file.id,
      filename: file.filename,
      size: file.size,
      mimeType: file.mimeType,
      state: file.status,
      progress: 100,
      error: file.rejectionReason ?? undefined,
    })),
  );
  const [busy, setBusy] = useState(false);

  const patch = useCallback((key: string, changes: Partial<UploadItem>) => {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    );
  }, []);

  const uploadOne = useCallback(
    async (file: File, key: string) => {
      try {
        const init = await api.initUpload(token, file.name, file.type, file.size);

        await uploadToStorage(init.uploadUrl, file, (progress) => patch(key, { progress }));

        patch(key, { state: 'verifying' });
        const { file: accepted } = await api.completeUpload(token, init.fileId);

        patch(key, { state: accepted.status, progress: 100 });
        toast({ title: 'Piece deposee', description: file.name, tone: 'success' });
      } catch (caught) {
        const message =
          caught instanceof ApiError ? caught.message : 'Le depot a echoue. Reessayez.';
        patch(key, { state: 'REJECTED', error: message });
        toast({ title: 'Depot refuse', description: file.name, tone: 'error' });
      }
    },
    [patch, toast, token],
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || busy) {
        return;
      }

      const accepted = items.filter((item) => item.state !== 'REJECTED').length;
      const remaining = view.maxFiles - accepted;

      if (remaining <= 0) {
        toast({
          title: 'Nombre maximum de pieces atteint',
          description: `${view.maxFiles} pieces au maximum.`,
          tone: 'error',
        });
        return;
      }

      // Controle cote client pour un retour immediat. Le serveur refait les
      // memes verifications : celles-ci sont du confort, pas de la securite.
      const queue: Array<{ file: File; key: string }> = [];
      const rejected: UploadItem[] = [];

      files.slice(0, remaining).forEach((file, index) => {
        const key = `${Date.now()}-${index}-${file.name}`;
        const base = {
          key,
          filename: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
        };

        if (!view.allowedMimeTypes.includes(file.type)) {
          rejected.push({
            ...base,
            state: 'REJECTED',
            progress: 0,
            error: 'Format non autorise. Formats acceptes : PDF, JPG, PNG.',
          });
          return;
        }

        if (file.size > view.maxFileSizeBytes) {
          rejected.push({
            ...base,
            state: 'REJECTED',
            progress: 0,
            error: `Fichier trop volumineux (maximum ${formatBytes(view.maxFileSizeBytes)}).`,
          });
          return;
        }

        queue.push({ file, key });
      });

      setItems((current) => [
        ...current,
        ...rejected,
        ...queue.map(({ file, key }) => ({
          key,
          filename: file.name,
          size: file.size,
          mimeType: file.type,
          state: 'uploading' as const,
          progress: 0,
        })),
      ]);

      if (files.length > remaining) {
        toast({
          title: 'Certaines pieces ont ete ignorees',
          description: `${view.maxFiles} pieces au maximum.`,
          tone: 'error',
        });
      }

      setBusy(true);
      for (const { file, key } of queue) {
        await uploadOne(file, key);
      }
      setBusy(false);

      // Le serveur fait autorite sur le statut final de la demande.
      await api
        .depositSession(token)
        .then(setView)
        .catch(() => undefined);
    },
    [busy, items, toast, token, uploadOne, view],
  );

  const acceptedCount = items.filter((item) => item.state === 'ACCEPTED').length;

  return (
    <AppShell>
      <Box maxW="640px" mx="auto">
        <Reveal>
          <Stack gap="20px">
            <Stack gap="6px">
              <Heading as="h1" fontSize={{ base: '24px', md: '28px' }} fontWeight="600">
                {view.title}
              </Heading>
              <Text fontSize="15px" color="gris">
                Depot securise — le lien {formatRemaining(view.expiresAt)}.
              </Text>
            </Stack>

            <DivCard>
              <Stack gap="16px">
                <FileDropzone
                  onFiles={(files) => void handleFiles(files)}
                  accept={view.allowedMimeTypes}
                  maxSizeBytes={view.maxFileSizeBytes}
                  disabled={busy}
                />

                {items.length > 0 ? (
                  <Box>
                    <HStack justify="space-between" pb="4px">
                      <Text fontSize="15px" fontWeight="600">
                        Pieces deposees
                      </Text>
                      <Text fontSize="14px" color="gris">
                        {acceptedCount} sur {view.maxFiles}
                      </Text>
                    </HStack>
                    {items.map((item) => (
                      <UploadRow key={item.key} item={item} />
                    ))}
                  </Box>
                ) : null}
              </Stack>
            </DivCard>

            {acceptedCount > 0 && !busy ? (
              <Box
                bg="successBg"
                color="successFg"
                borderRadius="div8"
                px="16px"
                py="12px"
                fontSize="14px"
                fontWeight="600"
              >
                {acceptedCount} piece{acceptedCount > 1 ? 's' : ''} transmise
                {acceptedCount > 1 ? 's' : ''} a votre avocat. Vous pouvez fermer cette page.
              </Box>
            ) : null}

            <Text fontSize="13px" color="gris">
              Vos pieces sont conservees uniquement jusqu&apos;a l&apos;expiration du lien, puis
              supprimees automatiquement.
            </Text>
          </Stack>
        </Reveal>
      </Box>
    </AppShell>
  );
}
