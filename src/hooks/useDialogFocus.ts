import { useEffect, useRef, type RefObject } from 'react';

const focusableSelector =
  'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';

const isUsableFocusTarget = (element: HTMLElement) =>
  element.isConnected &&
  element.tabIndex >= 0 &&
  element.getClientRects().length > 0 &&
  !element.closest('[aria-hidden="true"], [inert]');

export function useDialogFocus(open: boolean, container: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => {
      const preferred = container.current?.querySelector<HTMLElement>(
        '[data-autofocus], input:not([disabled]), textarea:not([disabled])',
      );
      (
        preferred ??
        container.current?.querySelector<HTMLElement>(focusableSelector) ??
        container.current
      )?.focus();
    });
    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      const openSelect = document.querySelector('[data-select-popup][data-open]');
      if (target?.closest('[data-select-popup]') || (event.key === 'Escape' && openSelect)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      }
      if (event.key !== 'Tab' || !container.current) return;
      const controls = Array.from(container.current.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        isUsableFocusTarget,
      );
      const first = controls[0];
      const last = controls.at(-1);
      if (!first) {
        event.preventDefault();
        container.current.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || !container.current.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !container.current.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      if (previousFocus && isUsableFocusTarget(previousFocus)) {
        previousFocus.focus({ preventScroll: true });
      } else {
        document.querySelector<HTMLElement>('#main-content')?.focus({ preventScroll: true });
      }
    };
  }, [open, container]);
}
