import type { SparkType } from '@/models';
import styles from '@/views/styles/app.module.css';

const iconPaths: Record<SparkType, string> = {
  White: `${import.meta.env.BASE_URL}spark-icons/white.webp`,
  Yellow: `${import.meta.env.BASE_URL}spark-icons/yellow.webp`,
  Blue: `${import.meta.env.BASE_URL}spark-icons/blue.webp`,
  Radiant: `${import.meta.env.BASE_URL}spark-icons/radiant.webp`,
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
  const displaySize = size + (size < 32 ? 10 : 8);

  return (
    <span
      className={`${styles.sparkToken} ${styles[`sparkToken${type}`]} ${animated ? styles.sparkTokenAnimated : ''}`}
      style={{ width: displaySize, height: displaySize }}
      data-spark-icon={type}
      aria-hidden="true"
    >
      <img
        className={styles.sparkTokenImage}
        src={iconPaths[type]}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
        width={displaySize}
        height={displaySize}
      />
    </span>
  );
}
