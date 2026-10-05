import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import styles from '@/views/styles/app.module.css';

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
  const dialog = useRef<HTMLElement>(null);
  const id = useId();
  const reduced = useReducedMotion();
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
    <AnimatePresence>
      {open && (
        <motion.div
          className={styles.modalBackdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            ref={dialog}
            tabIndex={-1}
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            aria-describedby={description ? `${id}-description` : undefined}
            initial={reduced ? false : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, y: 8 }}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>C-Job Sparks</p>
                <h2 id={`${id}-title`}>{title}</h2>
                {description && <p id={`${id}-description`}>{description}</p>}
              </div>
              <button className={styles.iconButton} type="button" onClick={onClose} aria-label="Close dialog">
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
