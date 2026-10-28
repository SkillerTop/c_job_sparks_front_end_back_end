import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Building2, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Feedback } from '@/views/components/common/Feedback';
import { useAuth } from '@/controllers/AuthContext';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import { useAuthFormController } from '@/controllers/useAuthFormController';
import { useAppMode } from '@/controllers/useAppMode';
import authStyles from '@/views/styles/auth.module.css';import { LocalizedText } from '@/views/components/common/LocalizedText';


type AuthMode = 'login' | 'register';
type FieldErrors = Partial<Record<'email' | 'password' | 'confirmPassword', string>>;

const safeReturnPath = (value: unknown) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/';

export function AuthForm({ mode }: { mode: AuthMode }) {
  const { localize } = useUserPreferences();
  const { isApiMode } = useAppMode();
  const location = useLocation();
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const {
    demoPassword,
    primaryDemoAccounts,
    moreDemoAccounts,
    registrationDemos,
    maxPasswordLength,
    normalizeEmail,
    validatePassword,
    isInvalidCredentialsError,
    microsoftSignInEnabled,
    startMicrosoftSignIn,
  } = useAuthFormController();
  const reducedMotion = useReducedMotion();
  const emailId = useId();
  const passwordId = useId();
  const confirmPasswordId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const initialEmail =
    typeof location.state === 'object' && location.state && 'email' in location.state
      ? String(location.state.email)
      : '';
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isRegister = mode === 'register';
  const passwordCheck = validatePassword(password);
  useEffect(() => {
    setErrors({});
    const parameters = new URLSearchParams(location.search);
    const microsoftError = parameters.get('microsoftError');
    const microsoftStatus = parameters.get('microsoftStatus');
    const microsoftEmail = parameters.get('email');
    if (microsoftEmail) setEmail(microsoftEmail);
    setMessage(
      microsoftStatus === 'Pending'
        ? 'Microsoft identity verified. Your access request is waiting for administrator approval.'
        : microsoftError
        ? microsoftError === 'MICROSOFT_SIGN_IN_CANCELLED'
          ? 'Microsoft sign-in was cancelled.'
          : microsoftError === 'FORBIDDEN'
            ? 'This Microsoft account is not linked to an approved C-Job Sparks account.'
            : 'Microsoft sign-in could not be completed. Try again or use your email and password.'
        : null,
    );
    setPassword('');
    setConfirmPassword('');
  }, [location.search, mode]);

  const validate = () => {
    const next: FieldErrors = {};
    const normalized = normalizeEmail(email);
    if (!/^\S+@\S+\.\S+$/.test(normalized)) next.email = 'Enter a valid work email.';
    if (!password) next.password = 'Enter your password.';
    if (isRegister && password && !passwordCheck.valid) next.password = passwordCheck.issues[0];
    if (isRegister && password !== confirmPassword) next.confirmPassword = 'Passwords do not match.';
    setErrors(next);
    const first = (['email', 'password', 'confirmPassword'] as const).find((field) => next[field]);
    if (first)
      ({ email: emailRef, password: passwordRef, confirmPassword: confirmPasswordRef }[first]).current?.focus();
    return Object.keys(next).length === 0;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      if (isRegister) {
        await register({ email, password, confirmPassword });
        setPassword('');
        setConfirmPassword('');
        navigate('/registration-status', { replace: true });
      } else {
        const status = await login({ email, password });
        setPassword('');
        if (status === 'Approved') {
          const from =
            typeof location.state === 'object' && location.state && 'from' in location.state
              ? location.state.from
              : '/';
          navigate(safeReturnPath(from), { replace: true });
        } else {
          navigate('/registration-status', { replace: true });
        }
      }
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : 'The request could not be completed.';
      setMessage(text);
      if (isInvalidCredentialsError(caught)) {
        passwordRef.current?.focus();
        setErrors({ password: 'Check your email and password.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemoAccount = (account: (typeof primaryDemoAccounts)[number]) => {
    setEmail(account.employee.email);
    setPassword(demoPassword);
    setConfirmPassword('');
    setErrors({});
    setMessage(null);
    passwordRef.current?.focus();
  };

  const fillDemoRegistration = (employee: (typeof registrationDemos)[number]) => {
    setEmail(employee.email);
    setPassword('');
    setConfirmPassword('');
    setErrors({});
    setMessage(null);
    passwordRef.current?.focus();
  };

  return (
    <motion.section
      className={authStyles.authCard}
      initial={reducedMotion ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.38, ease: 'easeOut' }}
      aria-labelledby="auth-title"
    >
      <div className={authStyles.authHeading}>
        <span className={authStyles.authIcon} aria-hidden="true">
          {isRegister ? <UserPlus size={22} /> : <KeyRound size={22} />}
        </span>
        <div>
          <p className={authStyles.eyebrow}><LocalizedText>{isRegister ? 'Request access' : 'Welcome back'}</LocalizedText></p>
          <h1 id="auth-title"><LocalizedText>{isRegister ? 'Create your account' : 'Sign in to C-Job Sparks'}</LocalizedText></h1>
          <p><LocalizedText>
            {isRegister
              ? 'Use your work email. After review, an administrator will create or link your employee profile.'
              : 'Use your approved work account to open your Spark workspace.'}
          </LocalizedText></p>
        </div>
      </div>

      {message && <Feedback tone={new URLSearchParams(location.search).get('microsoftStatus') === 'Pending' ? 'success' : 'error'}>{message}</Feedback>}

      {isApiMode && (
        <>
          <button
            className={authStyles.microsoftButton}
            type="button"
            disabled={!microsoftSignInEnabled}
            onClick={() => {
              const from =
                typeof location.state === 'object' && location.state && 'from' in location.state
                  ? safeReturnPath(location.state.from)
                  : '/';
              startMicrosoftSignIn(from);
            }}
          >
            <Building2 size={19} aria-hidden="true" />
            <LocalizedText>{isRegister ? 'Request access with Microsoft' : 'Continue with Microsoft'}</LocalizedText>
          </button>
          {!microsoftSignInEnabled && (
            <p className={authStyles.microsoftSetupHint} role="status">
              <LocalizedText>Microsoft sign-in is visible but unavailable until the administrator configures Entra ID.
            </LocalizedText></p>
          )}
          <div className={authStyles.authDivider}><span><LocalizedText>or use your password</LocalizedText></span></div>
        </>
      )}

      <form className={authStyles.authForm} onSubmit={submit} noValidate>
        <label className={authStyles.authField} htmlFor={emailId}>
          <span><LocalizedText>Work email</LocalizedText></span>
          <span className={`${authStyles.inputWrap} ${errors.email ? authStyles.inputError : ''}`}>
            <Mail size={18} aria-hidden="true" />
            <input
              ref={emailRef}
              id={emailId}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              maxLength={254}
              disabled={submitting}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? `${emailId}-error` : undefined}
              onChange={(event) => {
                setEmail(event.target.value);
                if (errors.email) setErrors((current) => ({ ...current, email: undefined }));
              }}
              placeholder="name@c-job.com.ua"
              required
            />
          </span>
          {errors.email && (
            <small className={authStyles.fieldError} id={`${emailId}-error`}>
              <LocalizedText>{errors.email}</LocalizedText>
            </small>
          )}
        </label>

        <div className={authStyles.authField}>
          <label htmlFor={passwordId}><LocalizedText>Password</LocalizedText></label>
          <div className={`${authStyles.inputWrap} ${errors.password ? authStyles.inputError : ''}`}>
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              ref={passwordRef}
              id={passwordId}
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password}
              maxLength={maxPasswordLength}
              disabled={submitting}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? `${passwordId}-error` : isRegister ? `${passwordId}-rules` : undefined}
              onChange={(event) => {
                setPassword(event.target.value);
                if (errors.password) setErrors((current) => ({ ...current, password: undefined }));
              }}
              required
            />
            <button
              className={authStyles.revealButton}
              type="button"
              disabled={submitting}
              onClick={() => setShowPassword((current) => !current)}
              aria-label={localize(
                isRegister
                  ? showPassword
                    ? 'Hide passwords'
                    : 'Show passwords'
                  : showPassword
                    ? 'Hide password'
                    : 'Show password',
              )}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.password && (
            <small className={authStyles.fieldError} id={`${passwordId}-error`}>
              <LocalizedText>{errors.password}</LocalizedText>
            </small>
          )}
        </div>

        {isRegister && (
          <>
            <ul
              className={authStyles.passwordRules}
              id={`${passwordId}-rules`}
              aria-label={localize('Password requirements')}
              aria-live="polite"
            >
              <li
                data-met={password.length >= 8}
                aria-label={localize(`${password.length >= 8 ? 'Met' : 'Not met'}: 8 or more characters`)}
              >
                <LocalizedText>8+ characters
              </LocalizedText></li>
              <li
                data-met={/[a-z]/.test(password) && /[A-Z]/.test(password)}
                aria-label={localize(`${/[a-z]/.test(password) && /[A-Z]/.test(password) ? 'Met' : 'Not met'}: upper and lowercase letters`)}
              >
                <LocalizedText>Upper &amp; lowercase
              </LocalizedText></li>
              <li
                data-met={/\d/.test(password)}
                aria-label={localize(`${/\d/.test(password) ? 'Met' : 'Not met'}: at least one number`)}
              >
                <LocalizedText>At least one number
              </LocalizedText></li>
            </ul>
            <label className={authStyles.authField} htmlFor={confirmPasswordId}>
              <span><LocalizedText>Confirm password</LocalizedText></span>
              <span className={`${authStyles.inputWrap} ${errors.confirmPassword ? authStyles.inputError : ''}`}>
                <ShieldCheck size={18} aria-hidden="true" />
                <input
                  ref={confirmPasswordRef}
                  id={confirmPasswordId}
                  name="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  maxLength={maxPasswordLength}
                  disabled={submitting}
                  aria-invalid={Boolean(errors.confirmPassword)}
                  aria-describedby={errors.confirmPassword ? `${confirmPasswordId}-error` : undefined}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    if (errors.confirmPassword)
                      setErrors((current) => ({ ...current, confirmPassword: undefined }));
                  }}
                  required
                />
              </span>
              {errors.confirmPassword && (
                <small className={authStyles.fieldError} id={`${confirmPasswordId}-error`}>
                  <LocalizedText>{errors.confirmPassword}</LocalizedText>
                </small>
              )}
            </label>
          </>
        )}

        <button className={authStyles.submitButton} type="submit" disabled={submitting}>
          {submitting ? <span className={authStyles.spinner} aria-hidden="true" /> : isRegister ? <UserPlus size={18} /> : <KeyRound size={18} />}
          <LocalizedText>{submitting ? 'Please wait…' : isRegister ? 'Submit for approval' : 'Sign in'}</LocalizedText>
        </button>
      </form>

      <p className={authStyles.authSwitch}>
        <LocalizedText>{isRegister ? 'Already approved?' : 'Need an account?'}</LocalizedText>{' '}
        <Link to={isRegister ? '/login' : '/register'}><LocalizedText>{isRegister ? 'Sign in' : 'Request access'}</LocalizedText></Link>
      </p>

      {!isApiMode && isRegister && registrationDemos.length > 0 && (
        <section className={authStyles.demoPanel} aria-labelledby="demo-registration-title">
          <div>
            <p className={authStyles.eyebrow}><LocalizedText>Try the approval flow</LocalizedText></p>
            <h2 id="demo-registration-title"><LocalizedText>Choose a demo directory profile</LocalizedText></h2>
          </div>
          <div className={authStyles.demoGrid}>
            {registrationDemos.map((employee) => (
              <button type="button" key={employee.id} onClick={() => fillDemoRegistration(employee)}>
                <strong><LocalizedText>{`Fill ${employee.name.split(' ')[0]}'s email`}</LocalizedText></strong>
                <span>{employee.email}</span>
              </button>
            ))}
          </div>
          <p className={authStyles.demoHelper}>
            <LocalizedText>If a profile already has a request, use its original password or choose another sample profile.
          </LocalizedText></p>
        </section>
      )}

      {!isApiMode && !isRegister && (
        <section className={authStyles.demoPanel} aria-labelledby="demo-access-title">
          <div>
            <p className={authStyles.eyebrow}><LocalizedText>Local demo access</LocalizedText></p>
            <h2 id="demo-access-title"><LocalizedText>Try an approved role</LocalizedText></h2>
          </div>
          <div className={authStyles.demoGrid}>
            {primaryDemoAccounts.map((account) => (
              <button type="button" key={account.employeeId} onClick={() => fillDemoAccount(account)}>
                <strong>{account.label}</strong>
                <span>{account.employee.email}</span>
              </button>
            ))}
          </div>
          <details className={authStyles.moreDemo}>
            <summary><LocalizedText>More demo roles</LocalizedText></summary>
            <div className={authStyles.demoGrid}>
              {moreDemoAccounts.map((account) => (
                <button type="button" key={account.employeeId} onClick={() => fillDemoAccount(account)}>
                  <strong>{account.label}</strong>
                  <span>{account.employee.email}</span>
                </button>
              ))}
            </div>
          </details>
        </section>
      )}

    </motion.section>
  );
}
