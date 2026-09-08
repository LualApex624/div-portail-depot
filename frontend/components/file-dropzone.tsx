'use client';

import { Box, Text, VStack } from '@chakra-ui/react';
import { Pressable } from '@/components/ui/pressable';
import { DragEvent, useRef, useState } from 'react';
import { formatBytes, formatFormatList } from '@/lib/format';

interface FileDropzoneProps {
  onFiles: (files: File[]) => void;
  accept: string[];
  maxSizeBytes: number;
  disabled?: boolean;
}

/**
 * Zone de depot : bordure pointillee, fond accent au survol, comme la charte.
 *
 * Accessible au clavier : c'est un `button`, donc focalisable et activable
 * par Entree ou Espace. Une zone de drop qui n'existe qu'a la souris exclut
 * une partie des utilisateurs et n'est pas testable au clavier.
 */
export function FileDropzone({ onFiles, accept, maxSizeBytes, disabled }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) {
      return;
    }
    onFiles(Array.from(event.dataTransfer.files));
  };

  const formats = formatFormatList(accept);

  return (
    <Pressable
      type="button"
      w="full"
      disabled={disabled}
      onClick={() => inputRef.current?.click()}
      onDragOver={(event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        if (!disabled) {
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      borderWidth="1px"
      borderStyle="dashed"
      borderColor={dragging ? 'primary' : 'grisClair'}
      borderRadius="div12"
      bg={dragging ? 'fondAccent' : 'white'}
      px="24px"
      py={{ base: '28px', md: '40px' }}
      cursor={disabled ? 'not-allowed' : 'pointer'}
      opacity={disabled ? 0.5 : 1}
      transition="background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.18s cubic-bezier(0.22, 1, 0.36, 1)"
      _hover={disabled ? undefined : { bg: 'fondAccent', borderColor: 'primary' }}
      _focusVisible={{ outline: '2px solid', outlineColor: 'primary', outlineOffset: '2px' }}
    >
      <VStack gap="6px">
        <Text fontSize={{ base: '15px', md: '16px' }} fontWeight="600" color="divText">
          Depose tes pieces ici
        </Text>
        <Text fontSize="14px" color="gris">
          {formats}, {formatBytes(maxSizeBytes)} maximum par fichier
        </Text>
      </VStack>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept.join(',')}
        hidden
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          // Reinitialise pour que redeposer le meme fichier declenche l'event.
          event.target.value = '';
        }}
      />
    </Pressable>
  );
}
