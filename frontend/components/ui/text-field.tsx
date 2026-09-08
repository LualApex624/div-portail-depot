'use client';

import { Box, Input, InputProps, Text } from '@chakra-ui/react';
import { FieldLabel } from '@/components/ui/pressable';
import { forwardRef, useId } from 'react';

interface TextFieldProps extends Omit<InputProps, 'size'> {
  label: string;
  error?: string;
  hint?: string;
}

/**
 * Champ de saisie de la charte : bordure 1 px, radius 8 px, focus en violet.
 * Le label est toujours lie au champ (`htmlFor`), et le message d'erreur est
 * annonce par `aria-describedby` plutot que seulement colore en rouge.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, ...props },
  ref,
) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <Box w="full">
      <FieldLabel htmlFor={id} display="block" fontSize="14px" fontWeight="600" mb="8px">
        {label}
      </FieldLabel>
      <Input
        ref={ref}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        h="46px"
        px="14px"
        fontSize="15px"
        bg="white"
        borderWidth="1px"
        borderColor={error ? 'dangerFg' : 'bordure'}
        borderRadius="div8"
        _placeholder={{ color: 'grisClair' }}
        _hover={{ borderColor: error ? 'dangerFg' : 'grisClair' }}
        _focusVisible={{
          borderColor: 'primary',
          boxShadow: '0 0 0 3px var(--chakra-colors-accentSoft)',
          outline: 'none',
        }}
        {...props}
      />
      {error ? (
        <Text id={`${id}-error`} fontSize="13px" color="dangerFg" mt="6px">
          {error}
        </Text>
      ) : hint ? (
        <Text id={`${id}-hint`} fontSize="13px" color="gris" mt="6px">
          {hint}
        </Text>
      ) : null}
    </Box>
  );
});
