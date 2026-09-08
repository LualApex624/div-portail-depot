'use client';

import { Box, HStack, Text } from '@chakra-ui/react';
import { Pressable } from '@/components/ui/pressable';
import { useState } from 'react';
import { useToast } from '@/components/ui/toaster';

interface CopyFieldProps {
  value: string;
  label: string;
  /** Monospace et tronque : reservé aux liens. */
  monospace?: boolean;
  /** Chiffres espaces : reservé au PIN. */
  spaced?: boolean;
}

/**
 * Valeur copiable. Toast a la copie, pas d'alerte.
 *
 * `navigator.clipboard` n'existe qu'en contexte securise (HTTPS ou
 * localhost) : on retombe donc sur une selection du texte, plutot que de
 * laisser un bouton qui ne fait rien.
 */
export function CopyField({ value, label, monospace, spaced }: CopyFieldProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: 'Copie', tone: 'success' });
    } catch {
      toast({
        title: 'Copie impossible',
        description: 'Selectionnez la valeur et copiez-la manuellement.',
        tone: 'error',
      });
    }
  };

  return (
    <Box>
      <Text fontSize="13px" color="gris" mb="6px" textTransform="uppercase" letterSpacing="0.04em">
        {label}
      </Text>
      <HStack
        gap="12px"
        borderWidth="1px"
        borderColor="bordure"
        borderRadius="div8"
        bg="fondAccent"
        px="14px"
        py="10px"
        justify="space-between"
      >
        <Text
          fontFamily={monospace ? 'monospace' : 'body'}
          fontSize={spaced ? '20px' : '14px'}
          fontWeight={spaced ? '600' : '400'}
          letterSpacing={spaced ? '0.35em' : undefined}
          color="divText"
          truncate={!spaced}
          title={value}
          userSelect="all"
          minW={0}
        >
          {value}
        </Text>
        <Pressable
          type="button"
          onClick={copy}
          flexShrink={0}
          color="primary"
          fontWeight="600"
          fontSize="14px"
          px="10px"
          py="4px"
          borderRadius="divFull"
          transition="background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1)"
          _hover={{ bg: 'accentSoft' }}
          _focusVisible={{ outline: '2px solid', outlineColor: 'primary', outlineOffset: '2px' }}
        >
          {copied ? 'Copie' : 'Copier'}
        </Pressable>
      </HStack>
    </Box>
  );
}
