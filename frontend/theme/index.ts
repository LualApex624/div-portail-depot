import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

/**
 * Charte DIV Protocol, transcrite en tokens Chakra v3.
 *
 * Les valeurs viennent telles quelles de l'enonce : elles ne sont ni
 * approximees ni "harmonisees". Tout ce qui touche a la couleur, au rayon et
 * a la typographie passe par ces tokens, jamais par une valeur en dur dans un
 * composant, pour que la densite reste constante d'un ecran a l'autre.
 *
 * Site light only : aucun mode sombre n'est declare, conformement a la charte.
 */
const divConfig = defineConfig({
  globalCss: {
    'html, body': {
      backgroundColor: 'white',
      color: 'divText',
      fontFamily: 'body',
      fontWeight: '400',
    },
    '*::selection': {
      backgroundColor: 'accentSoft',
    },
  },
  theme: {
    tokens: {
      colors: {
        // Couleurs de base
        primary: { value: '#5100FF' },
        secondary: { value: '#916ED8' },
        divText: { value: '#000000' },
        gris: { value: '#585858' },
        grisClair: { value: '#CECECE' },
        bordure: { value: '#E9E9E9' },
        fondAccent: { value: '#F7F6FF' },
        accentSoft: { value: '#DBCDFF' },

        // Semantiques : couleur sur fond
        successFg: { value: '#12AC64' },
        successBg: { value: '#D9FFED' },
        dangerFg: { value: '#FF4C4C' },
        dangerBg: { value: '#FFD0D0' },
        warningFg: { value: '#DA9705' },
        warningBg: { value: '#FFEDCA' },
        infoFg: { value: '#52A0EE' },
        infoBg: { value: '#DBEDFF' },
      },
      fonts: {
        body: { value: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
        heading: { value: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
      },
      fontWeights: {
        // 400 pour le corps, 600 pour les titres et les CTA. Il n'y a pas
        // d'autre graisse dans la charte.
        body: { value: '400' },
        heading: { value: '600' },
      },
      radii: {
        // 4, 8, 12 et 999 px. Rien d'autre.
        div4: { value: '4px' },
        div8: { value: '8px' },
        div12: { value: '12px' },
        divFull: { value: '999px' },
      },
      durations: {
        reveal: { value: '0.55s' },
      },
      easings: {
        // cubic-bezier(0.22, 1, 0.36, 1)
        div: { value: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      },
    },
    semanticTokens: {
      colors: {
        divBorder: { value: '{colors.bordure}' },
        divMuted: { value: '{colors.gris}' },
        divSurfaceAccent: { value: '{colors.fondAccent}' },
      },
    },
  },
});

export const system = createSystem(defaultConfig, divConfig);
