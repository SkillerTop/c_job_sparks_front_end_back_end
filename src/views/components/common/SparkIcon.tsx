import { motion, useReducedMotion } from 'framer-motion';
import type { SparkType } from '@/models';
import styles from '@/views/styles/app.module.css';

const iconPaths: Record<SparkType, string> = {
  White: `${import.meta.env.BASE_URL}spark-icons/white.png`,
  Yellow: `${import.meta.env.BASE_URL}spark-icons/yellow.png`,
  Blue: `${import.meta.env.BASE_URL}spark-icons/blue.png`,
  Radiant: `${import.meta.env.BASE_URL}spark-icons/radiant.png`,
};

const animationProfiles: Record<
  SparkType,
  { scale: number[]; rotate: number[]; duration: number }
> = {
  White: { scale: [1, 1.045, 1], rotate: [0, -2, 0], duration: 5.4 },
  Yellow: { scale: [1, 1.055, 1], rotate: [0, 3, 0], duration: 4.8 },
  Blue: { scale: [1, 1.05, 1], rotate: [0, -3, 0], duration: 5.1 },
  Radiant: { scale: [1, 1.07, 1], rotate: [0, 3, -2, 0], duration: 5.8 },
};

export function SparkIcon({
  type,
  size = 18,
  animated = true,
}: {
  type: SparkType;
  size?: number;
  animated?: boolean;
}) {
  const reduced = useReducedMotion();
  const canAnimate = animated && !reduced;
  const animation = animationProfiles[type];
  const displaySize = size + (size < 32 ? 10 : 8);

  return (
    <motion.span
      className={`${styles.sparkToken} ${styles[`sparkToken${type}`]} ${canAnimate ? styles.sparkTokenAnimated : ''}`}
      style={{ width: displaySize, height: displaySize }}
      data-spark-icon={type}
      aria-hidden="true"
      initial={false}
      animate={canAnimate ? { scale: animation.scale, rotate: animation.rotate } : { scale: 1, rotate: 0 }}
      transition={{ duration: canAnimate ? animation.duration : 0, ease: 'easeInOut', repeat: canAnimate ? Infinity : 0 }}
      whileHover={canAnimate ? { scale: 1.12, rotate: 0, transition: { duration: 0.22 } } : undefined}
    >
      <img
        className={styles.sparkTokenImage}
        src={iconPaths[type]}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
      />
    </motion.span>
  );
}
