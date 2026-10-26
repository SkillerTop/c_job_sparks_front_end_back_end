import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/controllers/ThemeContext';
import styles from '@/views/styles/app.module.css';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';

export function ThemeToggle({ variant = 'toolbar' }: { variant?: 'toolbar' | 'menu' }) {
  const { theme, toggleTheme } = useTheme();
  const { t } = useUserPreferences();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className={variant === 'menu' ? styles.themeToggleMenu : `${styles.iconButton} ${styles.themeToggle}`}
      onClick={toggleTheme}
      aria-label={t('theme.switch', { theme: t(dark ? 'theme.light' : 'theme.dark') })}
      aria-pressed={dark}
      title={t('theme.switch', { theme: t(dark ? 'theme.light' : 'theme.dark') })}
    >
      <span
        key={theme}
        className={styles.themeGlyph}
        aria-hidden="true"
      >
        {dark ? <Moon size={18} /> : <Sun size={18} />}
      </span>
      <span className={variant === 'menu' ? styles.themeMenuLabel : styles.themeLabel}>
        {t(dark ? 'theme.darkLabel' : 'theme.lightLabel')}
      </span>
    </button>
  );
}
