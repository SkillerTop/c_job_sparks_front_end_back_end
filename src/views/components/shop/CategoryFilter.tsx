import { ArrowUpDown } from 'lucide-react';
import { SHOP_CATEGORIES, SHOP_SORTS } from '@/constants/shop';
import type { ShopCategoryFilter, ShopSort } from '@/models/shop';
import { SelectField } from '@/views/components/ui/SelectField';
import styles from '@/views/styles/shop.module.css';import { useLocalizedShopText } from '@/hooks/useLocalizedShopText';
import { LocalizedText } from '@/views/components/common/LocalizedText';


export function CategoryFilter({
  category,
  sort,
  onCategoryChange,
  onSortChange,
}: {
  category: ShopCategoryFilter;
  sort: ShopSort;
  onCategoryChange: (category: ShopCategoryFilter) => void;
  onSortChange: (sort: ShopSort) => void;
}) {
  const shopText = useLocalizedShopText();
  return (
    <section className={styles.shopControls} aria-label={shopText.aria.filters}>
      <div className={styles.categoryScroller} role="group" aria-label={shopText.aria.categories}>
        {SHOP_CATEGORIES.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={category === item.value}
            className={category === item.value ? styles.categoryActive : styles.categoryButton}
            onClick={() => onCategoryChange(item.value)}
          >
            <LocalizedText>{item.label}</LocalizedText>
          </button>
        ))}
      </div>
      <SelectField
        value={sort}
        onChange={onSortChange}
        options={SHOP_SORTS}
        ariaLabel={shopText.aria.sort}
        icon={<ArrowUpDown size={15} />}
        variant="filter"
        className={styles.sortSelect}
      />
    </section>
  );
}
