import { CheckCircle2, Clock3, LogIn, RotateCcw, ShieldAlert } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { AuthLayout } from '@/views/components/auth/AuthLayout';
import { StatusBadge } from '@/views/components/common/StatusBadge';
import { useAuth } from '@/controllers/AuthContext';
import authStyles from '@/views/styles/auth.module.css';

export function RegistrationStatusPage() {
  const { registrationAccount, clearRegistrationView } = useAuth();
  const reducedMotion = useReducedMotion();

  if (!registrationAccount)
    return (
      <AuthLayout>
        <section className={authStyles.statusCard}>
          <span className={authStyles.statusIcon}>
            <ShieldAlert size={26} />
          </span>
          <p className={authStyles.eyebrow}>Access status</p>
          <h1>No registration in progress</h1>
          <p>Sign in with an approved account or create a request using your directory email.</p>
          <div className={authStyles.statusActions}>
            <Link className={authStyles.primaryLink} to="/login">Sign in</Link>
            <Link className={authStyles.secondaryLink} to="/register">Request access</Link>
          </div>
        </section>
      </AuthLayout>
    );

  const approved = registrationAccount.status === 'Approved';
  const rejected = registrationAccount.status === 'Rejected';

  return (
    <AuthLayout>
      <motion.section
        className={authStyles.statusCard}
        initial={reducedMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.35 }}
      >
        <span className={`${authStyles.statusIcon} ${approved ? authStyles.statusIconSuccess : rejected ? authStyles.statusIconDanger : ''}`}>
          {approved ? <CheckCircle2 size={27} /> : rejected ? <ShieldAlert size={27} /> : <Clock3 size={27} />}
        </span>
        <p className={authStyles.eyebrow}>Registration status</p>
        <h1>{approved ? 'Access approved' : rejected ? 'Request needs attention' : 'Approval pending'}</h1>
        <div className={authStyles.statusEmail} role="status" aria-live="polite" aria-atomic="true">
          <span>{registrationAccount.email}</span>
          <StatusBadge status={registrationAccount.status} />
        </div>
        <p>
          {approved
            ? 'Your account is ready. Sign in with the password you created.'
            : rejected
              ? 'The administrator did not approve this request. You can submit it again using the same password.'
              : 'An administrator needs to confirm your account before you can enter the workspace.'}
        </p>
        {rejected && registrationAccount.rejectionReason && (
          <div className={authStyles.rejectionReason} role="note">
            <strong>Administrator note</strong>
            <p>{registrationAccount.rejectionReason}</p>
          </div>
        )}
        {!approved && !rejected && (
          <p className={authStyles.localHint}>Keep this page open to see approval updates from another tab in this browser.</p>
        )}
        <div className={authStyles.statusActions}>
          {approved ? (
            <Link className={authStyles.primaryLink} to="/login" state={{ email: registrationAccount.email }}>
              <LogIn size={17} /> Sign in
            </Link>
          ) : rejected ? (
            <Link className={authStyles.primaryLink} to="/register" state={{ email: registrationAccount.email }}>
              <RotateCcw size={17} /> Submit again
            </Link>
          ) : (
            <Link className={authStyles.secondaryLink} to="/login">Back to sign in</Link>
          )}
          <Link
            className={authStyles.textLink}
            to="/login"
            onClick={() => clearRegistrationView()}
          >
            Use another account
          </Link>
        </div>
      </motion.section>
    </AuthLayout>
  );
}
