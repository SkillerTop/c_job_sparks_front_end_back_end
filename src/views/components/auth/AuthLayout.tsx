import type { ReactNode } from 'react';
import { ShieldCheck, Sparkles } from 'lucide-react';
import { AnimatedWaves } from '@/views/components/common/AnimatedWaves';
import { BrandLockup } from '@/views/components/common/BrandLockup';
import { ThemeToggle } from '@/views/components/layout/ThemeToggle';
import authStyles from '@/views/styles/auth.module.css';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={authStyles.authShell}>
      <a className={authStyles.skipLink} href="#auth-content">
        Skip to account content
      </a>
      <aside className={authStyles.brandPanel} aria-label="C-Job Sparks">
        <div className={authStyles.brandTop}>
          <BrandLockup />
        </div>
        <div className={authStyles.brandMessage}>
          <span className={authStyles.brandEyebrow}>
            <Sparkles size={15} /> Recognition with purpose
          </span>
          <h2>One place for every contribution.</h2>
          <p>Sign in to recognize colleagues, follow your Sparks and celebrate work that moves C-Job forward.</p>
          <div className={authStyles.trustNote}>
            <ShieldCheck size={18} />
            <span>Access follows the role in the employee directory.</span>
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
        <div className={authStyles.authDemoBanner} role="note">
          Local browser demo · approvals are not shared with other devices · do not use real credentials
        </div>
        <div className={authStyles.authContent}>{children}</div>
        <p className={authStyles.authFootnote}>© 2026 C-Job Naval Architects · Spark System</p>
      </main>
    </div>
  );
}
