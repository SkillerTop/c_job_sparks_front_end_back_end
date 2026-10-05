import styles from '@/views/styles/app.module.css';

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`${styles.brandLockup} ${compact ? styles.brandLockupCompact : ''}`}>
      <img
        className={styles.brandLogoImage}
        src={`${import.meta.env.BASE_URL}brand/c-job-nikolayev.png`}
        alt=""
        width="800"
        height="800"
        decoding="async"
      />
      {!compact && <small className={styles.brandSystemLabel}>SPARK SYSTEM</small>}
    </span>
  );
}
