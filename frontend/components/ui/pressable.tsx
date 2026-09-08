'use client';

import { chakra } from '@chakra-ui/react';

/**
 * Bouton HTML habille par Chakra.
 *
 * `<Box as="button">` perd le typage propre a l'element (`type`, `disabled`)
 * dans le systeme polymorphe de Chakra v3. La fabrique `chakra('button')`
 * garde le contrat HTML complet tout en acceptant les props de style.
 */
export const Pressable = chakra('button');

/** Meme raison, pour les labels lies a un champ (`htmlFor`). */
export const FieldLabel = chakra('label');
