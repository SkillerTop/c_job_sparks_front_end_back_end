import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LocalizedText } from '@/views/components/common/LocalizedText';
import styles from '@/views/styles/app.module.css';

type BackNavigationButtonProps = {
  fallbackTo?: string;
};

export function BackNavigationButton({ fallbackTo = '/' }: BackNavigationButtonProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    const routerHistoryIndex = window.history.state?.idx;
    if (typeof routerHistoryIndex === 'number' && routerHistoryIndex > 0) {
      navigate(-1);
      return;
    }

    navigate(fallbackTo, { replace: true });
  };

  return (
    <button className={styles.primaryButton} onClick={handleBack} type="button">
      <ArrowLeft aria-hidden="true" size={16} />
      <LocalizedText>Back</LocalizedText>
    </button>
  );
}
