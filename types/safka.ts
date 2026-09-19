/**
 * Safka (صفقة) Public API types.
 *
 * Base URL: https://api.safka-eg.com
 * Auth:     api-safka-key header
 */

export interface SafkaProductProperty {
  _id: string;
  key: string;
  value?: number | null;
  min?: number | null;
  sale_price?: number | null;
  is_available?: boolean;
}

export interface SafkaFaq {
  _id?: string;
  question: string;
  answer: string;
  is_active?: boolean;
  order?: number;
}

export interface SafkaProduct {
  _id: string;
  name: string;
  barcode?: string | null;
  sale_price: number;
  images?: string[];
  image?: string | null;
  description?: string | null;
  note?: string | null;
  media_url?: string | null;
  properties?: SafkaProductProperty[];
  is_active?: boolean;
  faqs?: SafkaFaq[];
}

export interface SafkaProductList {
  data: SafkaProduct[];
  totalItems: number;
  pages: number;
  currentPage: number;
  itemsPerPage: number;
  mostRecentCount?: number;
  mostPopularCount?: number;
}

export interface SafkaProductDetail {
  product: SafkaProduct;
}