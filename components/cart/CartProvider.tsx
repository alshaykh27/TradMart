"use client";

import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type CartItem = {
  productId: string;
  qty: number;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  add: (productId: string, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  reset: () => void;
};

const STORAGE_KEY = "tradmart-cart";

const CartContext = createContext<CartContextValue | null>(null);

// Cached, stable references so React never sees a "fresh" array on each call.
const EMPTY: CartItem[] = [];

let cachedItems: CartItem[] = EMPTY;
let cachedRaw: string | null | undefined = undefined; // undefined = not read yet

function parseCart(raw: string): CartItem[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CartItem[]) : EMPTY;
  } catch {
    // corrupted storage
    return EMPTY;
  }
}

function readRawCart(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // storage unavailable (private mode)
    return null;
  }
}

/**
 * Small external store. The cart is read from localStorage only after hydration
 * (the server snapshot is the cached EMPTY constant), so the server HTML always
 * matches the client's first render.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): CartItem[] {
  const raw = readRawCart();
  if (cachedRaw === undefined || raw !== cachedRaw) {
    cachedRaw = raw;
    cachedItems = raw === null ? EMPTY : parseCart(raw);
  }
  return cachedItems;
}

function getServerSnapshot(): CartItem[] {
  return EMPTY;
}

function applyUpdate(updater: (prev: CartItem[]) => CartItem[]) {
  cachedItems = updater(cachedItems);
  cachedRaw = JSON.stringify(cachedItems);
  try {
    window.localStorage.setItem(STORAGE_KEY, cachedRaw);
  } catch {
    // storage unavailable (private mode)
  }
  listeners.forEach((listener) => listener());
}

export function CartProvider({ children }: { children: ReactNode }) {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count: items.reduce((sum, item) => sum + item.qty, 0),
      add: (productId: string, qty = 1) => {
        applyUpdate((prev) => {
          const found = prev.find((item) => item.productId === productId);
          if (found) {
            return prev.map((item) =>
              item.productId === productId ? { ...item, qty: item.qty + qty } : item,
            );
          }
          return [...prev, { productId, qty }];
        });
      },
      setQty: (productId: string, qty: number) => {
        applyUpdate((prev) => {
          if (qty <= 0) return prev.filter((item) => item.productId !== productId);
          return prev.map((item) =>
            item.productId === productId ? { ...item, qty } : item,
          );
        });
      },
      remove: (productId: string) => {
        applyUpdate((prev) => prev.filter((item) => item.productId !== productId));
      },
      reset: () => applyUpdate(() => EMPTY),
    }),
    [items],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within a CartProvider");
  return context;
}