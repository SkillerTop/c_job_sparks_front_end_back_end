import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Feedback } from '@/views/components/common/Feedback';
import { useAuth } from '@/controllers/AuthContext';
import { useAuthFormController } from '@/controllers/useAuthFormController';
import authStyles from '@/views/styles/auth.module.css';

type AuthMode = 'login' | 'register';
type FieldErrors = Partial<Record<'email' | 'password' | 'confirmPassword', string>>;

const safeReturnPath = (value: unknown) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/';

export function AuthForm({ mode }: { mode: AuthMode }) {
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
    setMessage(null);
    setPassword('');
    setConfirmPassword('');
  }, [mode]);

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

  const useDemoAccount = (account: (typeof primaryDemoAccounts)[number]) => {
    setEmail(account.employee.email);
    setPassword(demoPassword);
    setConfirmPassword('');
    setErrors({});
    setMessage(null);
    passwordRef.current?.focus();
  };

  const useDemoRegistration = (employee: (typeof registrationDemos)[number]) => {
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
          <p className={authStyles.eyebrow}>{isRegister ? 'Request access' : 'Welcome back'}</p>
          <h1 id="auth-title">{isRegister ? 'Create your account' : 'Sign in to C-Job Sparks'}</h1>
          <p>
            {isRegister
              ? 'Use the work email from the employee directory. An administrator will review your request.'
              : 'Use your approved work account to open your Spark workspace.'}
          </p>
        </div>
      </div>

      {message && <Feedback tone="error">{message}</Feedback>}

      <form className={authStyles.authForm} onSubmit={submit} noValidate>
        <label className={authStyles.authField} htmlFor={emailId}>
          <span>Work email</span>
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
              placeholder="name@c-job.test"
              required
            />
          </span>
          {errors.email && (
            <small className={authStyles.fieldError} id={`${emailId}-error`}>
              {errors.email}
            </small>
          )}
        </label>

        <div className={authStyles.authField}>
          <label htmlFor={passwordId}>Password</label>
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
              aria-label={
                isRegister
                  ? showPassword
                    ? 'Hide passwords'
                    : 'Show passwords'
                  : showPassword
                    ? 'Hide password'
                    : 'Show password'
              }
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.password && (
            <small className={authStyles.fieldError} id={`${passwordId}-error`}>
              {errors.password}
            </small>
          )}
        </div>

        {isRegister && (
          <>
            <ul
              className={authStyles.passwordRules}
              id={`${passwordId}-rules`}
              aria-label="Password requirements"
              aria-live="polite"
            >
              <li
                data-met={password.length >= 8}
                aria-label={`${password.length >= 8 ? 'Met' : 'Not met'}: 8 or more characters`}
              >
                8+ characters
              </li>
              <li
                data-met={/[a-z]/.test(password) && /[A-Z]/.test(password)}
                aria-label={`${/[a-z]/.test(password) && /[A-Z]/.test(password) ? 'Met' : 'Not met'}: upper and lowercase letters`}
              >
                Upper &amp; lowercase
              </li>
              <li
                data-met={/\d/.test(password)}
                aria-label={`${/\d/.test(password) ? 'Met' : 'Not met'}: at least one number`}
              >
                At least one number
              </li>
            </ul>
            <label className={authStyles.authField} htmlFor={confirmPasswordId}>
              <span>Confirm password</span>
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
                  {errors.confirmPassword}
                </small>
              )}
            </label>
          </>
        )}

        <button className={authStyles.submitButton} type="submit" disabled={submitting}>
          {submitting ? <span className={authStyles.spinner} aria-hidden="true" /> : isRegister ? <UserPlus size={18} /> : <KeyRound size={18} />}
          {submitting ? 'Please wait…' : isRegister ? 'Submit for approval' : 'Sign in'}
        </button>
      </form>

      <p className={authStyles.authSwitch}>
        {isRegister ? 'Already approved?' : 'Need an account?'}{' '}
        <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Request access'}</Link>
      </p>

      {isRegister && registrationDemos.length > 0 && (
        <section className={authStyles.demoPanel} aria-labelledby="demo-registration-title">
          <div>
            <p className={authStyles.eyebrow}>Try the approval flow</p>
            <h2 id="demo-registration-title">Choose a demo directory profile</h2>
          </div>
          <div className={authStyles.demoGrid}>
            {registrationDemos.map((employee) => (
              <button type="button" key={employee.id} onClick={() => useDemoRegistration(employee)}>
                <strong>Fill {employee.name.split(' ')[0]}'s email</strong>
                <span>{employee.email}</span>
              </button>
            ))}
          </div>
          <p className={authStyles.demoHelper}>
            If a profile already has a request, use its original password or choose another sample profile.
          </p>
        </section>
      )}

      {!isRegister && (
        <section className={authStyles.demoPanel} aria-labelledby="demo-access-title">
          <div>
            <p className={authStyles.eyebrow}>Local demo access</p>
            <h2 id="demo-access-title">Try an approved role</h2>
          </div>
          <div className={authStyles.demoGrid}>
            {primaryDemoAccounts.map((account) => (
              <button type="button" key={account.employeeId} onClick={() => useDemoAccount(account)}>
                <strong>{account.label}</strong>
                <span>{account.employee.email}</span>
              </button>
            ))}
          </div>
          <details className={authStyles.moreDemo}>
            <summary>More demo roles</summary>
            <div className={authStyles.demoGrid}>
              {moreDemoAccounts.map((account) => (
                <button type="button" key={account.employeeId} onClick={() => useDemoAccount(account)}>
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
