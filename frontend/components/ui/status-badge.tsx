'use client';

import { Box } from '@chakra-ui/react';
import type { FileStatus, RequestStatus } from '@/lib/types';

/**
 * Statuts de demande et de piece.
 *
 * Couleur semantique sur fond semantique, jamais de couleur crue : c'est
 * exactement ce que demande la charte. Le libelle est en francais courant,
 * pas l'enum technique.
 */
const REQUEST_STYLES: Record<RequestStatus, { label: string; fg: string; bg: string }> = {
  PENDING: { label: 'En attente', fg: 'warningFg', bg: 'warningBg' },
  COMPLETE: { label: 'Complete', fg: 'successFg', bg: 'successBg' },
  EXPIRED: { label: 'Expiree', fg: 'gris', bg: 'bordure' },
  LOCKED: { label: 'Verrouillee', fg: 'dangerFg', bg: 'dangerBg' },
};

const FILE_STYLES: Record<FileStatus, { label: string; fg: string; bg: string }> = {
  PENDING: { label: 'En cours', fg: 'infoFg', bg: 'infoBg' },
  ACCEPTED: { label: 'Acceptee', fg: 'successFg', bg: 'successBg' },
  REJECTED: { label: 'Refusee', fg: 'dangerFg', bg: 'dangerBg' },
};

interface BadgeProps {
  children: React.ReactNode;
  fg: string;
  bg: string;
}

function Pill({ children, fg, bg }: BadgeProps) {
  return (
    <Box
      as="span"
      display="inline-flex"
      alignItems="center"
      bg={bg}
      color={fg}
      fontSize="13px"
      fontWeight="600"
      px="12px"
      py="4px"
      borderRadius="divFull"
      whiteSpace="nowrap"
    >
      {children}
    </Box>
  );
}

export function StatusBadge({ status }: { status: RequestStatus }) {
  const style = REQUEST_STYLES[status];
  return (
    <Pill fg={style.fg} bg={style.bg}>
      {style.label}
    </Pill>
  );
}

export function FileStatusBadge({ status }: { status: FileStatus }) {
  const style = FILE_STYLES[status];
  return (
    <Pill fg={style.fg} bg={style.bg}>
      {style.label}
    </Pill>
  );
}

/** Compteur neutre : "3 pieces". Fond accent doux, jamais une couleur d'etat. */
export function CountPill({ count }: { count: number }) {
  return (
    <Pill fg="primary" bg="fondAccent">
      {count} piece{count > 1 ? 's' : ''}
    </Pill>
  );
}
