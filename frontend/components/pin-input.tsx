'use client';

import { Box, HStack, Input } from '@chakra-ui/react';
import { ClipboardEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';

const PIN_LENGTH = 8;

interface PinInputProps {
  onComplete: (pin: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  /** Incrementer cette valeur vide et refocalise le champ apres un echec. */
  resetSignal?: number;
}

/**
 * Saisie du code PIN a 8 chiffres.
 *
 * Details qui comptent a l'usage, et qui n'existent pas dans un simple champ
 * texte : avance automatique, retour arriere qui revient sur la case
 * precedente, navigation aux fleches, et surtout collage d'un code entier
 * depuis un SMS, qui remplit les huit cases d'un coup.
 *
 * `inputMode="numeric"` fait apparaitre le pave numerique sur mobile, ou ce
 * parcours sera majoritairement utilise.
 */
export function PinInput({ onComplete, disabled, invalid, resetSignal = 0 }: PinInputProps) {
  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(''));
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (resetSignal > 0) {
      setDigits(Array(PIN_LENGTH).fill(''));
      inputs.current[0]?.focus();
    }
  }, [resetSignal]);

  const commit = (next: string[]) => {
    setDigits(next);
    const pin = next.join('');
    if (pin.length === PIN_LENGTH && !next.includes('')) {
      onComplete(pin);
    }
  };

  const handleChange = (index: number, rawValue: string) => {
    const value = rawValue.replace(/\D/g, '');
    if (!value) {
      commit(digits.map((digit, position) => (position === index ? '' : digit)));
      return;
    }

    // Une saisie multi-caracteres (autofill SMS) remplit les cases suivantes.
    const next = [...digits];
    for (let offset = 0; offset < value.length && index + offset < PIN_LENGTH; offset += 1) {
      next[index + offset] = value[offset];
    }
    commit(next);
    inputs.current[Math.min(index + value.length, PIN_LENGTH - 1)]?.focus();
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault();
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      inputs.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      inputs.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowRight' && index < PIN_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH);
    if (!pasted) {
      return;
    }
    event.preventDefault();
    const next = Array(PIN_LENGTH).fill('');
    pasted.split('').forEach((digit, position) => {
      next[position] = digit;
    });
    commit(next);
    inputs.current[Math.min(pasted.length, PIN_LENGTH - 1)]?.focus();
  };

  return (
    // Les cases se partagent la largeur disponible plutot que d'avoir une
    // taille fixe : a 375 px, huit cases de largeur fixe debordent de la carte.
    <HStack
      w="full"
      gap={{ base: '4px', sm: '8px' }}
      justify="center"
      role="group"
      aria-label="Code PIN"
    >
      {digits.map((digit, index) => (
        <Box key={index} flex="1" minW={0} maxW={{ base: '44px', sm: '48px' }}>
          <Input
            ref={(element) => {
              inputs.current[index] = element;
            }}
            value={digit}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={handlePaste}
            onFocus={(event) => event.target.select()}
            disabled={disabled}
            aria-label={`Chiffre ${index + 1} sur ${PIN_LENGTH}`}
            aria-invalid={invalid}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={PIN_LENGTH}
            textAlign="center"
            fontSize={{ base: '18px', sm: '22px' }}
            fontWeight="600"
            w="full"
            h={{ base: '52px', sm: '56px' }}
            px="0"
            bg="white"
            borderWidth="1px"
            borderColor={invalid ? 'dangerFg' : 'bordure'}
            borderRadius="div8"
            _hover={{ borderColor: invalid ? 'dangerFg' : 'grisClair' }}
            _focusVisible={{
              borderColor: 'primary',
              boxShadow: '0 0 0 3px var(--chakra-colors-accentSoft)',
              outline: 'none',
            }}
            _disabled={{ opacity: 0.5, cursor: 'not-allowed' }}
            autoFocus={index === 0}
          />
        </Box>
      ))}
    </HStack>
  );
}
