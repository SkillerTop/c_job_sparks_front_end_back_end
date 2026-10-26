import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { useUserPreferences } from '@/controllers/UserPreferencesContext';
import styles from '@/views/styles/app.module.css';import { LocalizedText } from '@/views/components/common/LocalizedText';


export function Modal({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { localize } = useUserPreferences();
  const dialog = useRef<HTMLElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const root = document.getElementById('root');
    const previous = root?.inert ?? false;
    if (root) root.inert = true;
    return () => {
      if (root) root.inert = previous;
    };
  }, [open]);
  useDialogFocus(open, dialog, onClose);
  return createPortal(
    <>
      {open ? (
        <div
          className={styles.modalBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <section
            ref={dialog}
            tabIndex={-1}
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            aria-describedby={description ? `${id}-description` : undefined}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}><LocalizedText>C-Job Sparks</LocalizedText></p>
                <h2 id={`${id}-title`}>{localize(title)}</h2>
                {description && <p id={`${id}-description`}>{localize(description)}</p>}
              </div>
              <button className={styles.iconButton} type="button" onClick={onClose} aria-label={localize('Close dialog')}>
                <X size={18} />
              </button>
            </div>
            {children}
          </section>
        </div>
      ) : null}
    </>,
    document.body,
  );
}
