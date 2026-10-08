export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      products: {
        // safka_product_id is nullable: manually-added products (source =
        // 'manual') are created by hand in the admin panel and have no Safka
        // counterpart. Rows written by Safka always carry an id — the webhook
        // normalizer returns null for a payload with neither _id nor barcode.
        Row: {
          id: string;
          safka_product_id: string | null;
          barcode: string | null;
          name: string;
          description: string | null;
          price: number;
          image_url: string | null;
          images: Json | null;
          variants: Json | null;
          media_url: string | null;
          stock: number;
          status: string;
          is_published: boolean;
          cost_price: number | null;
          commission: number | null;
          // Safka's suggested selling price, parsed from the product note by the
          // sync (there is no structured API field for it). NULL when the note
          // is absent, malformed, or describes two quantity tiers — the admin
          // "use suggested commission" button is not rendered in that case.
          safka_suggested_price: number | null;
          // safka_suggested_price - cost_price, so applying it lands exactly on
          // the suggested price. Derived rather than read from the note, whose
          // own commission figure goes stale when sale_price changes.
          safka_suggested_commission: number | null;
          // 'safka' = mirrored from the Safka API/webhook; 'manual' = created
          // by hand. Safka writers must filter on source <> 'manual'.
          source: "safka" | "manual";
          // Storefront section. NULL = not categorised yet. Safka sends no
          // category, so this is always assigned by hand in the admin panel —
          // for synced AND manual products. Safka writers must never include it
          // in their update payloads or a sync would wipe the assignment.
          category_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          safka_product_id?: string | null;
          barcode?: string | null;
          name?: string;
          description?: string | null;
          price?: number;
          image_url?: string | null;
          images?: Json | null;
          variants?: Json | null;
          media_url?: string | null;
          stock?: number;
          status?: string;
          is_published?: boolean;
          cost_price?: number | null;
          commission?: number | null;
          safka_suggested_price?: number | null;
          safka_suggested_commission?: number | null;
          source?: "safka" | "manual";
          category_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          safka_product_id?: string | null;
          barcode?: string | null;
          name?: string;
          description?: string | null;
          price?: number;
          image_url?: string | null;
          images?: Json | null;
          variants?: Json | null;
          media_url?: string | null;
          stock?: number;
          status?: string;
          is_published?: boolean;
          cost_price?: number | null;
          commission?: number | null;
          safka_suggested_price?: number | null;
          safka_suggested_commission?: number | null;
          source?: "safka" | "manual";
          category_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          name_ar: string;
          slug: string;
          icon: string | null;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name_ar: string;
          slug: string;
          icon?: string | null;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name_ar?: string;
          slug?: string;
          icon?: string | null;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      governorate_pricing: {
        Row: {
          governorate_id: string;
          name_ar: string;
          name_en: string;
          safka_shipping_fee: number;
          updated_at: string;
        };
        Insert: {
          governorate_id: string;
          name_ar: string;
          name_en?: string;
          safka_shipping_fee: number;
          updated_at?: string;
        };
        Update: {
          governorate_id?: string;
          name_ar?: string;
          name_en?: string;
          safka_shipping_fee?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      safka_cities: {
        Row: {
          city_id: string;
          governorate_id: string;
          name_ar: string;
          name_en: string;
          updated_at: string;
        };
        Insert: {
          city_id: string;
          governorate_id: string;
          name_ar: string;
          name_en?: string;
          updated_at?: string;
        };
        Update: {
          city_id?: string;
          governorate_id?: string;
          name_ar?: string;
          name_en?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          safka_order_id: string | null;
          customer_name: string;
          phone: string;
          country: string;
          city: string;
          city_id: string | null;
          governorate: string | null;
          shipping_governorate: string | null;
          address: string;
          subtotal: number;
          shipping_fee: number;
          total: number;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          safka_order_id?: string | null;
          customer_name: string;
          phone: string;
          country: string;
          city: string;
          city_id?: string | null;
          governorate?: string | null;
          shipping_governorate?: string | null;
          address: string;
          subtotal?: number;
          shipping_fee?: number;
          total?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          safka_order_id?: string | null;
          customer_name?: string;
          phone?: string;
          country?: string;
          city?: string;
          city_id?: string | null;
          governorate?: string | null;
          shipping_governorate?: string | null;
          address?: string;
          subtotal?: number;
          shipping_fee?: number;
          total?: number;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string | null;
          quantity: number;
          price: number;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id?: string | null;
          quantity: number;
          price: number;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string | null;
          quantity?: number;
          price?: number;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          id: string;
          store_name: string;
          shipping_markup: number;
          /** Public. Renamed from facebook_pixel_id in Phase 8. */
          meta_pixel_id: string | null;
          /** Server-only. Never leaves the server. */
          meta_capi_token: string | null;
          /** Public. */
          tiktok_pixel_id: string | null;
          /** Server-only. Never leaves the server. */
          tiktok_api_token: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_name?: string;
          shipping_markup?: number;
          meta_pixel_id?: string | null;
          meta_capi_token?: string | null;
          tiktok_pixel_id?: string | null;
          tiktok_api_token?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_name?: string;
          shipping_markup?: number;
          meta_pixel_id?: string | null;
          meta_capi_token?: string | null;
          tiktok_pixel_id?: string | null;
          tiktok_api_token?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      webhook_logs: {
        Row: {
          id: number;
          payload: Json;
          received_at: string;
        };
        Insert: {
          id?: number;
          payload: Json;
          received_at?: string;
        };
        Update: {
          id?: number;
          payload?: Json;
          received_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
