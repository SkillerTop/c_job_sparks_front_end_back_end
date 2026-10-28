import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import styles from '@/views/styles/app.module.css';

export function BackToTop() {
  const { t } = useUserPreferences();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > 420);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <>
      {visible ? (
        <button
          type="button"
          className={styles.backToTop}
          onClick={() => window.scrollTo({
            top: 0,
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          })}
          aria-label={t('backToTop')}
          title={t('backToTop')}
        >
          <ArrowUp size={20} aria-hidden="true" />
        </button>
      ) : null}
    </>
  );
}
