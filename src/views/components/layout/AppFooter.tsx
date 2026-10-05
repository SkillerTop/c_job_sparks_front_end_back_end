import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Pause, Play } from 'lucide-react';
import { AnimatedWaves } from '@/views/components/common/AnimatedWaves';
import { BrandLockup } from '@/views/components/common/BrandLockup';
import styles from '@/views/styles/app.module.css';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';

export function AppFooter() {
  const [paused, setPaused] = useState(false);
  const wavesId = useId();
  const { t } = useUserPreferences();

  return (
    <footer className={styles.appFooter}>
      <AnimatedWaves paused={paused} id={wavesId} />
      <div className={styles.footerContent}>
        <div className={styles.footerBrandRow}>
          <Link to="/" className={styles.footerLogo} aria-label="C-Job Sparks home">
            <BrandLockup compact />
          </Link>
          <p className={styles.footerTagline}>
            {t('footer.tagline')} <span>{t('footer.future')}</span>
          </p>
          <Link to="/rules" className={styles.footerRulesLink}>
            <BookOpen size={15} /> {t('nav.rules')}
          </Link>
          <button
            type="button"
            className={styles.footerMotionControl}
            onClick={() => setPaused((value) => !value)}
            aria-controls={wavesId}
          >
            {paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
            <span>{paused ? t('footer.play') : t('footer.pause')}</span>
          </button>
        </div>
        <div className={styles.footerMeta}>
          <span>{t('footer.copyright', { year: new Date().getFullYear() })}</span>
          <span>{t('footer.purpose')}</span>
        </div>
      </div>
    </footer>
  );
}
