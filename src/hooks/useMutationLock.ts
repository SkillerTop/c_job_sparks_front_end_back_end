import { useCallback, useRef, useState } from 'react';

export function useMutationLock() {
  const lock = useRef(false);
  const [mutating, setMutating] = useState(false);
  const execute = useCallback(async <T>(action: () => Promise<T>): Promise<T> => {
    if (lock.current) throw new Error('Another action is being processed. Please wait.');
    lock.current = true;
    setMutating(true);
    try {
      return await action();
    } finally {
      lock.current = false;
      setMutating(false);
    }
  }, []);
  const isLocked = useCallback(() => lock.current, []);
  return { mutating, execute, isLocked };
}
