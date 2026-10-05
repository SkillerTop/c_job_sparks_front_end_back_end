import { Moon, Sun } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTheme } from '@/controllers/ThemeContext';
import styles from '@/views/styles/app.module.css';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';

export function ThemeToggle({ variant = 'toolbar' }: { variant?: 'toolbar' | 'menu' }) {
  const { theme, toggleTheme } = useTheme();
  const { t } = useUserPreferences();
  const reduced = useReducedMotion();
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
      <motion.span
        key={theme}
        initial={reduced ? false : { opacity: 0, rotate: -35 }}
        animate={{ opacity: 1, rotate: 0 }}
        transition={{ duration: reduced ? 0 : 0.2 }}
        aria-hidden="true"
      >
        {dark ? <Moon size={18} /> : <Sun size={18} />}
      </motion.span>
      <span className={variant === 'menu' ? styles.themeMenuLabel : styles.themeLabel}>
        {t(dark ? 'theme.darkLabel' : 'theme.lightLabel')}
      </span>
    </button>
  );
}
