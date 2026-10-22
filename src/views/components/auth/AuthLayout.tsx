import type { ReactNode } from 'react';
import { ShieldCheck, Sparkles } from 'lucide-react';
import { AnimatedWaves } from '@/views/components/common/AnimatedWaves';
import { BrandLockup } from '@/views/components/common/BrandLockup';
import { ThemeToggle } from '@/views/components/layout/ThemeToggle';
import { useAppMode } from '@/controllers/useAppMode';
import authStyles from '@/views/styles/auth.module.css';import { LocalizedText } from '@/views/components/common/LocalizedText';


export function AuthLayout({ children }: { children: ReactNode }) {
  const { isApiMode } = useAppMode();
  return (
    <div className={authStyles.authShell}>
      <a className={authStyles.skipLink} href="#auth-content">
        <LocalizedText>Skip to account content
      </LocalizedText></a>
      <aside className={authStyles.brandPanel} aria-label="C-Job Sparks">
        <div className={authStyles.brandTop}>
          <BrandLockup />
        </div>
        <div className={authStyles.brandMessage}>
          <span className={authStyles.brandEyebrow}>
            <Sparkles size={15} /> <LocalizedText>Recognition with purpose
          </LocalizedText></span>
          <h2><LocalizedText>One place for every contribution.</LocalizedText></h2>
          <p><LocalizedText>Sign in to recognize colleagues, follow your Sparks and celebrate work that moves C-Job forward.</LocalizedText></p>
          <div className={authStyles.trustNote}>
            <ShieldCheck size={18} />
            <span><LocalizedText>Access follows the role in the employee directory.</LocalizedText></span>
          </div>
        </div>
        <div className={authStyles.brandWaves}>
          <AnimatedWaves paused={false} id="auth-waves" />
        </div>
      </aside>
      <main className={authStyles.authMain} id="auth-content" tabIndex={-1}>
        <div className={authStyles.authToolbar}>
          <ThemeToggle />
        </div>
        {!isApiMode && (
          <div className={authStyles.authDemoBanner} role="note">
            <LocalizedText>Local browser demo · approvals are not shared with other devices · do not use real credentials
          </LocalizedText></div>
        )}
        <div className={authStyles.authContent}>{children}</div>
        <p className={authStyles.authFootnote}><LocalizedText>© 2026 C-Job Naval Architects · Spark System</LocalizedText></p>
      </main>
    </div>
  );
}
