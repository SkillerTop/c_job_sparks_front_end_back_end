export function focusFirstInvalid(form: HTMLFormElement) {
  const focus = (attemptsLeft: number) => {
    requestAnimationFrame(() => {
      const invalid = form.querySelector<HTMLElement>('[aria-invalid="true"]');
      if (invalid) {
        invalid.focus();
        invalid.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } else if (attemptsLeft > 1) {
        focus(attemptsLeft - 1);
      }
    });
  };
  focus(3);
}
