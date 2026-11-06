import type { ShopProduct, SparkPriceComponent } from '@/models/shop';
import { getProductPriceComponents } from '@/utils/shop';
import { SparkAmount } from './SparkAmount';
import styles from '@/views/styles/shop.module.css';

export function SparkPrice({
  product,
  components,
  signed = false,
  compact = false,
  className = '',
}: {
  product?: Pick<ShopProduct, 'price' | 'priceSparkType' | 'priceComponents'>;
  components?: SparkPriceComponent[];
  signed?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const values = components ?? (product ? getProductPriceComponents(product) : []);
  return (
    <span className={`${styles.sparkPrice} ${className}`}>
      {values.map((component) => (
        <SparkAmount
          key={component.sparkType}
          amount={component.amount}
          sparkType={component.sparkType}
          signed={signed}
          compact={compact}
        />
      ))}
    </span>
  );
}
