import { useCallback, useEffect, useMemo, useState } from 'react';
import { SHOP_TEXT } from '@/constants/shop';
import { useAuth } from '@/controllers/AuthContext';
import { useShop } from '@/controllers/ShopContext';
import type {
  ProductDraft,
  ShopAdminState,
  ShopProduct,
  SpendableSparkType,
} from '@/models/shop';
import { shopService } from '@/services/shopService';

const EMPTY_PRODUCT: ProductDraft = {
  name: '',
  description: '',
  imageUrl: null,
  icon: 'gift',
  category: 'Boosters',
  rarity: 'Common',
  price: 4,
  priceSparkType: 'White',
  productType: 'Consumable',
  durationHours: null,
  stock: null,
  isActive: true,
  isFeatured: false,
  isLimited: false,
  availableFrom: null,
  availableUntil: null,
};

type ShopAdminMessage = {
  tone: 'success' | 'error' | 'info';
  text: string;
};

export function useShopAdminController() {
  const { user } = useAuth();
  const { refresh: refreshShop } = useShop();
  const [state, setState] = useState<ShopAdminState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<ProductDraft | null>(null);
  const [message, setMessage] = useState<ShopAdminMessage | null>(null);
  const [adjustUser, setAdjustUser] = useState('');
  const [adjustSparkType, setAdjustSparkType] = useState<SpendableSparkType>('White');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const clientIdentity = useMemo(
    () =>
      user
        ? { id: user.employeeId, email: user.email, role: user.role }
        : undefined,
    [user?.employeeId, user?.email, user?.role],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await shopService.getAdminState(clientIdentity);
      setState(next);
      setAdjustUser((current) => current || next.balances[0]?.userId || '');
      setMessage(null);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : SHOP_TEXT.errors.loadAdmin,
      });
    } finally {
      setLoading(false);
    }
  }, [clientIdentity]);

  useEffect(() => {
    void load();
  }, [load]);

  const previewProduct = useMemo<ShopProduct | null>(
    () =>
      editing
        ? {
            ...editing,
            id: editing.id || 'preview',
            createdAt: new Date().toISOString(),
          }
        : null,
    [editing],
  );

  const openProduct = (product?: ShopProduct) => {
    setMessage(null);
    setEditing(
      product
        ? {
            id: product.id,
            name: product.name,
            description: product.description,
            imageUrl: product.imageUrl,
            icon: product.icon,
            category: product.category,
            rarity: product.rarity,
            price: product.price,
            priceSparkType: product.priceSparkType,
            productType: product.productType,
            durationHours: product.durationHours,
            stock: product.stock,
            isActive: product.isActive,
            isFeatured: product.isFeatured,
            isLimited: product.isLimited,
            availableFrom: product.availableFrom,
            availableUntil: product.availableUntil,
          }
        : { ...EMPTY_PRODUCT },
    );
  };

  const saveProduct = async () => {
    if (!editing || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const next = await shopService.saveProduct(editing, clientIdentity);
      setState(next);
      setEditing(null);
      setMessage({ tone: 'success', text: SHOP_TEXT.admin.productSaved });
      await refreshShop();
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : SHOP_TEXT.errors.saveProduct,
      });
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (file?: File) => {
    if (!file || !editing) return;
    setUploading(true);
    setMessage(null);
    try {
      const result = await shopService.uploadProductImage(file, clientIdentity);
      setEditing((current) => (current ? { ...current, imageUrl: result.imageUrl } : current));
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : SHOP_TEXT.errors.uploadImage,
      });
    } finally {
      setUploading(false);
    }
  };

  const submitAdjustment = async () => {
    if (saving || !adjustUser) return;
    setSaving(true);
    setMessage(null);
    try {
      const next = await shopService.adjustBalance(
        adjustUser,
        adjustSparkType,
        Number(adjustAmount),
        adjustReason,
        clientIdentity,
      );
      setState(next);
      setAdjustAmount('');
      setAdjustReason('');
      setMessage({ tone: 'success', text: SHOP_TEXT.admin.balanceSaved });
      await refreshShop();
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : SHOP_TEXT.errors.adjustBalance,
      });
    } finally {
      setSaving(false);
    }
  };

  return {
    state,
    loading,
    saving,
    uploading,
    editing,
    setEditing,
    message,
    adjustUser,
    setAdjustUser,
    adjustSparkType,
    setAdjustSparkType,
    adjustAmount,
    setAdjustAmount,
    adjustReason,
    setAdjustReason,
    previewProduct,
    openProduct,
    saveProduct,
    uploadImage,
    submitAdjustment,
  };
}
