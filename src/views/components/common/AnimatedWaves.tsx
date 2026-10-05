import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { usePageVisibility } from '@/hooks/usePageVisibility';
import styles from '@/views/styles/app.module.css';

// Two identical periods keep the edge seamless while the ribbon moves by half its width.
const WAVE_PATH = 'M0 64C200 16 400 16 600 64S1000 112 1200 64S1600 16 1800 64S2200 112 2400 64V120H0Z';
const layers = ['waveBack', 'waveMiddle', 'waveFront'] as const;

export function AnimatedWaves({ paused, id }: { paused: boolean; id: string }) {
  const container = useRef<HTMLDivElement>(null);
  const inView = useInView(container, { margin: '80px 0px' });
  const reduced = useReducedMotion();
  const visible = usePageVisibility();
  // CSS follows live changes to reduced motion without restarting the component.
  const playing = !paused && visible && inView;

  return (
    <div
      ref={container}
      id={id}
      className={`${styles.waveLayers} ${playing ? styles.waveRunning : ''}`}
      aria-hidden="true"
    >
      <motion.div
        className={styles.waveArtwork}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0 : 0.7 }}
      >
        {layers.map((layer) => (
          <svg
            key={layer}
            className={`${styles.waveStrip} ${styles[layer]}`}
            viewBox="0 0 2400 120"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
          >
            <path d={WAVE_PATH} />
          </svg>
        ))}
      </motion.div>
    </div>
  );
}
