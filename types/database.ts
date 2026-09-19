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
        Row: {
          id: string;
          safka_product_id: string;
          name: string;
          description: string | null;
          price: number;
          image_url: string | null;
          stock: number;
          status: string;
          is_published: boolean;
          cost_price: number | null;
          commission: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          safka_product_id: string;
          name: string;
          description?: string | null;
          price?: number;
          image_url?: string | null;
          stock?: number;
          status?: string;
          is_published?: boolean;
          cost_price?: number | null;
          commission?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          safka_product_id?: string;
          name?: string;
          description?: string | null;
          price?: number;
          image_url?: string | null;
          stock?: number;
          status?: string;
          is_published?: boolean;
          cost_price?: number | null;
          commission?: number | null;
          created_at?: string;
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
          address: string;
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
          address: string;
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
          address?: string;
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
          facebook_pixel_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_name?: string;
          facebook_pixel_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_name?: string;
          facebook_pixel_id?: string | null;
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
