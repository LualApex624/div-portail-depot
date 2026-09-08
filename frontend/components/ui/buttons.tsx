'use client';

import { Button, ButtonProps, Spinner } from '@chakra-ui/react';
import { forwardRef } from 'react';

export interface DivButtonProps extends ButtonProps {
  /** Affiche un indicateur et neutralise le bouton pendant une action. */
  loading?: boolean;
  loadingText?: string;
}

/**
 * Bouton primaire : la signature d'interaction du site.
 *
 * Fond primary, texte blanc, graisse 600, padding 24 px / 14 px, radius full.
 * Au survol le bouton s'inverse : fond #F7F6FF, texte primary, contour inset
 * 1 px primary. Le contour est un `boxShadow: inset` et non une `border`,
 * pour que l'apparition du trait ne decale pas le contenu d'un pixel.
 */
export const PrimaryButton = forwardRef<HTMLButtonElement, DivButtonProps>(
  function PrimaryButton({ loading, loadingText, children, disabled, ...props }, ref) {
    return (
      <Button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        bg="primary"
        color="white"
        fontWeight="600"
        fontSize="15px"
        lineHeight="1.2"
        px="24px"
        py="14px"
        h="auto"
        borderRadius="divFull"
        transition="background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1), color 0.18s cubic-bezier(0.22, 1, 0.36, 1)"
        _hover={{
          bg: 'fondAccent',
          color: 'primary',
          boxShadow: 'inset 0 0 0 1px var(--chakra-colors-primary)',
        }}
        _focusVisible={{ outline: '2px solid', outlineColor: 'primary', outlineOffset: '2px' }}
        _disabled={{
          opacity: 0.45,
          cursor: 'not-allowed',
          _hover: { bg: 'primary', color: 'white' },
        }}
        {...props}
      >
        {loading ? <Spinner size="xs" mr="8px" /> : null}
        {loading ? (loadingText ?? children) : children}
      </Button>
    );
  },
);

/** Action secondaire : "Annuler", "Retour". Neutre, jamais concurrente du CTA. */
export const GhostButton = forwardRef<HTMLButtonElement, ButtonProps>(
  function GhostButton(props, ref) {
    return (
      <Button
        ref={ref}
        bg="transparent"
        color="gris"
        fontWeight="600"
        fontSize="15px"
        px="24px"
        py="14px"
        h="auto"
        borderRadius="divFull"
        boxShadow="inset 0 0 0 1px var(--chakra-colors-bordure)"
        transition="background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1), color 0.18s cubic-bezier(0.22, 1, 0.36, 1)"
        _hover={{ bg: 'fondAccent', color: 'primary' }}
        _focusVisible={{ outline: '2px solid', outlineColor: 'primary', outlineOffset: '2px' }}
        {...props}
      />
    );
  },
);
