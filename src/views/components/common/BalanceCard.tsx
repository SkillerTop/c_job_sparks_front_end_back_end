import { motion, useReducedMotion } from 'framer-motion';
import { SparkIcon } from './SparkIcon';
import type { SparkType } from '@/models';
import styles from '@/views/styles/app.module.css';

const captions: Record<SparkType, string> = {
  White: 'Everyday recognition',
  Yellow: 'Significant contribution',
  Blue: 'Long-term impact',
  Radiant: 'Company-wide distinction',
};

export function BalanceCard({
  type,
  value,
  index = 0,
  caption = captions[type],
}: {
  type: SparkType;
  value: number;
  index?: number;
  caption?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.article
      className={`${styles.balanceCard} ${styles[`tone${type}`]}`}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduced ? 0 : index * 0.05 }}
      whileHover={reduced ? undefined : { y: -3 }}
    >
      <span className={styles.sparkOrb}>
        <SparkIcon type={type} size={type === 'Radiant' ? 40 : 32} />
      </span>
      <p>{type}</p>
      <strong>{value}</strong>
      <small>{caption}</small>
    </motion.article>
  );
}
