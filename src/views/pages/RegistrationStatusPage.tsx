import { CheckCircle2, Clock3, LogIn, RotateCcw, ShieldAlert } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { AuthLayout } from '@/views/components/auth/AuthLayout';
import { StatusBadge } from '@/views/components/common/StatusBadge';
import { useAuth } from '@/controllers/AuthContext';
import authStyles from '@/views/styles/auth.module.css';import { LocalizedText } from '@/views/components/common/LocalizedText';


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
          <p className={authStyles.eyebrow}><LocalizedText>Access status</LocalizedText></p>
          <h1><LocalizedText>No registration in progress</LocalizedText></h1>
          <p><LocalizedText>Sign in with an approved account or request access with your work email.</LocalizedText></p>
          <div className={authStyles.statusActions}>
            <Link className={authStyles.primaryLink} to="/login"><LocalizedText>Sign in</LocalizedText></Link>
            <Link className={authStyles.secondaryLink} to="/register"><LocalizedText>Request access</LocalizedText></Link>
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
        <p className={authStyles.eyebrow}><LocalizedText>Registration status</LocalizedText></p>
        <h1><LocalizedText>{approved ? 'Access approved' : rejected ? 'Request needs attention' : 'Approval pending'}</LocalizedText></h1>
        <div className={authStyles.statusEmail} role="status" aria-live="polite" aria-atomic="true">
          <span>{registrationAccount.email}</span>
          <StatusBadge status={registrationAccount.status} />
        </div>
        <p>
          <LocalizedText>{approved
            ? 'Your account is ready. Sign in with the password you created.'
            : rejected
              ? 'The administrator did not approve this request. You can submit it again using the same password.'
              : 'An administrator needs to complete your employee profile and approve the account before you can enter the workspace.'}</LocalizedText>
        </p>
        {rejected && registrationAccount.rejectionReason && (
          <div className={authStyles.rejectionReason} role="note">
            <strong><LocalizedText>Administrator note</LocalizedText></strong>
            <p>{registrationAccount.rejectionReason}</p>
          </div>
        )}
        {!approved && !rejected && (
          <p className={authStyles.localHint}><LocalizedText>Keep this page open to see approval updates from another tab in this browser.</LocalizedText></p>
        )}
        <div className={authStyles.statusActions}>
          {approved ? (
            <Link className={authStyles.primaryLink} to="/login" state={{ email: registrationAccount.email }}>
              <LogIn size={17} /> <LocalizedText>Sign in
            </LocalizedText></Link>
          ) : rejected ? (
            <Link className={authStyles.primaryLink} to="/register" state={{ email: registrationAccount.email }}>
              <RotateCcw size={17} /> <LocalizedText>Submit again
            </LocalizedText></Link>
          ) : (
            <Link className={authStyles.secondaryLink} to="/login"><LocalizedText>Back to sign in</LocalizedText></Link>
          )}
          <Link
            className={authStyles.textLink}
            to="/login"
            onClick={() => clearRegistrationView()}
          >
            <LocalizedText>Use another account
          </LocalizedText></Link>
        </div>
      </motion.section>
    </AuthLayout>
  );
}
