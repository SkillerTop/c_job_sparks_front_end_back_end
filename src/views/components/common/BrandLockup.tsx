import styles from '@/views/styles/app.module.css';import { LocalizedText } from '@/views/components/common/LocalizedText';


export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`${styles.brandLockup} ${compact ? styles.brandLockupCompact : ''}`}>
      <img
        className={styles.brandLogoImage}
        src={`${import.meta.env.BASE_URL}brand/c-job-nikolayev.png`}
        alt=""
        width="717"
        height="292"
        decoding="async"
      />
      {!compact && <small className={styles.brandSystemLabel}><LocalizedText>SPARK FORGE</LocalizedText></small>}
    </span>
  );
}
