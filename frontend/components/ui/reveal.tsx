'use client';

import { Box, BoxProps } from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';

interface RevealProps extends BoxProps {
  /** Decalage en ms, pour echelonner une liste sans la faire clignoter. */
  delay?: number;
}

/**
 * Reveal au scroll de la charte : opacite 0 -> 1, y 24 -> 0, 0.55 s,
 * easing cubic-bezier(0.22, 1, 0.36, 1).
 *
 * IntersectionObserver plutot qu'une animation au montage : les cartes du
 * dashboard sous la ligne de flottaison s'animent quand on les atteint.
 * L'element reste visible si l'observateur n'est pas disponible.
 */
export function Reveal({ children, delay = 0, ...props }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.05 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <Box
      ref={ref}
      opacity={visible ? 1 : 0}
      transform={visible ? 'translateY(0)' : 'translateY(24px)'}
      transition="opacity 0.55s cubic-bezier(0.22, 1, 0.36, 1), transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)"
      transitionDelay={`${delay}ms`}
      {...props}
    >
      {children}
    </Box>
  );
}
