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

/**
 * Create-order contract, transcribed from the Safka Public API docs
 * (POST /api/v1/public/orders).
 *
 * Required fields: client_name, client_phone1, client_address,
 * shipping_governorate, commission, items, total.
 * Optional fields we deliberately omit: page_name, page_id (not required, we
 * have neither). `client_phone2` / `note` are sent as empty strings, matching
 * the documented example.
 *
 * `shipping_governorate` is the price-list (pricing) document `_id` — NOT a
 * governorate name (kept in the governorate_pricing table, synced from Safka).
 * `items[].property` is the Safka property/variant `_id`.
 */
export interface SafkaOrderItemInput {
  product: string;
  property: string;
  qty: string;
}

export interface SafkaCreateOrderRequest {
  items: SafkaOrderItemInput[];
  client_name: string;
  client_phone1: string;
  client_phone2: string;
  client_address: string;
  shipping_governorate: string;
  commission: number;
  total: number;
  city: string;
  note: string;
}

export interface SafkaCreateOrderResponse {
  success: boolean;
  data?: {
    _id: string;
    status?: string;
    serial_number?: string;
    marketer?: string;
    holding_to?: string | null;
  };
  errors?: { msg: string }[];
}

export interface SafkaPriceListCity {
  id: string;
  city_name_ar?: string;
  city_name_en?: string;
}

export interface SafkaPriceListEntry {
  _id: string;
  governorate?: number;
  price?: number;
  is_active?: boolean;
  governorateName?: string;
  governorateNameAr?: string;
  cities?: SafkaPriceListCity[];
}

export interface SafkaPriceListResponse {
  success: boolean;
  itemsCount?: number;
  pages?: number;
  data?: SafkaPriceListEntry[];
}