export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string
          display_name: string | null
          email: string | null
          avatar_url: string | null
          onboarding_completed: boolean
          onboarding_step: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          plan: string
          plan_status: string
          monthly_order_count: number
          monthly_order_limit: number
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          display_name?: string | null
          email?: string | null
          avatar_url?: string | null
          onboarding_completed?: boolean
          onboarding_step?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          plan?: string
          plan_status?: string
          monthly_order_count?: number
          monthly_order_limit?: number
        }
        Update: {
          user_id?: string
          display_name?: string | null
          email?: string | null
          avatar_url?: string | null
          onboarding_completed?: boolean
          onboarding_step?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          plan?: string
          plan_status?: string
          monthly_order_count?: number
          monthly_order_limit?: number
        }
        Relationships: []
      }
      connected_accounts: {
        Row: {
          id: string
          user_id: string
          platform: string
          platform_shop_id: string | null
          platform_shop_name: string | null
          status: string
          access_token_encrypted: string | null
          refresh_token_encrypted: string | null
          webhook_secret_encrypted: string | null
          token_expires_at: string | null
          scopes: string[] | null
          last_sync_at: string | null
          sync_cursor: Json
          error_message: string | null
          connected_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          platform: string
          platform_shop_id?: string | null
          platform_shop_name?: string | null
          status?: string
          access_token_encrypted?: string | null
          refresh_token_encrypted?: string | null
          token_expires_at?: string | null
          scopes?: string[] | null
          last_sync_at?: string | null
          sync_cursor?: Json
          error_message?: string | null
          connected_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          platform?: string
          platform_shop_id?: string | null
          platform_shop_name?: string | null
          status?: string
          access_token_encrypted?: string | null
          refresh_token_encrypted?: string | null
          token_expires_at?: string | null
          scopes?: string[] | null
          last_sync_at?: string | null
          sync_cursor?: Json
          error_message?: string | null
          connected_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          id: string
          user_id: string
          platform: string
          platform_order_id: string
          platform_order_number: string | null
          customer_id: string | null
          status: string | null
          financial_status: string | null
          fulfillment_status: string | null
          subtotal_cents: number
          shipping_cents: number
          tax_cents: number
          discount_cents: number
          total_cents: number
          currency: string
          printify_production_cost_cents: number | null
          printify_shipping_cost_cents: number | null
          printify_order_id: string | null
          platform_fee_cents: number
          transaction_fee_cents: number
          payment_processing_fee_cents: number
          listing_fee_cents: number
          profit_cents: number | null
          tracking_number: string | null
          tracking_url: string | null
          carrier: string | null
          shipped_at: string | null
          delivered_at: string | null
          ordered_at: string
          created_at: string
          updated_at: string
          raw_data: Json
        }
        Insert: {
          id?: string
          user_id: string
          platform: string
          platform_order_id: string
          platform_order_number?: string | null
          customer_id?: string | null
          status?: string | null
          financial_status?: string | null
          fulfillment_status?: string | null
          subtotal_cents?: number
          shipping_cents?: number
          tax_cents?: number
          discount_cents?: number
          total_cents?: number
          currency?: string
          printify_production_cost_cents?: number | null
          printify_shipping_cost_cents?: number | null
          printify_order_id?: string | null
          platform_fee_cents?: number
          transaction_fee_cents?: number
          payment_processing_fee_cents?: number
          listing_fee_cents?: number
          profit_cents?: number | null
          tracking_number?: string | null
          tracking_url?: string | null
          carrier?: string | null
          shipped_at?: string | null
          delivered_at?: string | null
          ordered_at: string
          raw_data?: Json
        }
        Update: {
          id?: string
          user_id?: string
          platform?: string
          platform_order_id?: string
          platform_order_number?: string | null
          customer_id?: string | null
          status?: string | null
          financial_status?: string | null
          fulfillment_status?: string | null
          subtotal_cents?: number
          shipping_cents?: number
          tax_cents?: number
          discount_cents?: number
          total_cents?: number
          currency?: string
          printify_production_cost_cents?: number | null
          printify_shipping_cost_cents?: number | null
          printify_order_id?: string | null
          platform_fee_cents?: number
          transaction_fee_cents?: number
          payment_processing_fee_cents?: number
          listing_fee_cents?: number
          profit_cents?: number | null
          tracking_number?: string | null
          tracking_url?: string | null
          carrier?: string | null
          shipped_at?: string | null
          delivered_at?: string | null
          ordered_at?: string
          raw_data?: Json
        }
        Relationships: []
      }
      order_line_items: {
        Row: {
          id: string
          user_id: string
          order_id: string
          product_id: string | null
          title: string
          quantity: number
          unit_price_cents: number
          total_cents: number
          sku: string | null
          variant_title: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          order_id: string
          product_id?: string | null
          title: string
          quantity?: number
          unit_price_cents?: number
          total_cents?: number
          sku?: string | null
          variant_title?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          order_id?: string
          product_id?: string | null
          title?: string
          quantity?: number
          unit_price_cents?: number
          total_cents?: number
          sku?: string | null
          variant_title?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          etsy_listing_id: string | null
          shopify_product_id: string | null
          printify_product_id: string | null
          status: string
          price_cents: number | null
          currency: string
          total_sales: number
          total_revenue_cents: number
          total_views: number
          total_favorites: number
          printify_production_cost_cents: number | null
          image_url: string | null
          tags: string[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          description?: string | null
          etsy_listing_id?: string | null
          shopify_product_id?: string | null
          printify_product_id?: string | null
          status?: string
          price_cents?: number | null
          currency?: string
          total_sales?: number
          total_revenue_cents?: number
          total_views?: number
          total_favorites?: number
          printify_production_cost_cents?: number | null
          image_url?: string | null
          tags?: string[] | null
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          description?: string | null
          etsy_listing_id?: string | null
          shopify_product_id?: string | null
          printify_product_id?: string | null
          status?: string
          price_cents?: number | null
          currency?: string
          total_sales?: number
          total_revenue_cents?: number
          total_views?: number
          total_favorites?: number
          printify_production_cost_cents?: number | null
          image_url?: string | null
          tags?: string[] | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          id: string
          user_id: string
          email: string | null
          first_name: string | null
          last_name: string | null
          full_name: string | null
          phone: string | null
          etsy_customer_id: string | null
          shopify_customer_id: string | null
          printify_customer_id: string | null
          city: string | null
          state: string | null
          country: string | null
          zip: string | null
          order_count: number
          total_spent_cents: number
          average_order_cents: number
          first_order_at: string | null
          last_order_at: string | null
          rfm_recency: number | null
          rfm_frequency: number | null
          rfm_monetary: number | null
          rfm_segment: string | null
          tags: string[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          full_name?: string | null
          phone?: string | null
          etsy_customer_id?: string | null
          shopify_customer_id?: string | null
          printify_customer_id?: string | null
          city?: string | null
          state?: string | null
          country?: string | null
          zip?: string | null
          order_count?: number
          total_spent_cents?: number
          average_order_cents?: number
          first_order_at?: string | null
          last_order_at?: string | null
          rfm_recency?: number | null
          rfm_frequency?: number | null
          rfm_monetary?: number | null
          rfm_segment?: string | null
          tags?: string[] | null
        }
        Update: {
          id?: string
          user_id?: string
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          full_name?: string | null
          phone?: string | null
          etsy_customer_id?: string | null
          shopify_customer_id?: string | null
          printify_customer_id?: string | null
          city?: string | null
          state?: string | null
          country?: string | null
          zip?: string | null
          order_count?: number
          total_spent_cents?: number
          average_order_cents?: number
          first_order_at?: string | null
          last_order_at?: string | null
          rfm_recency?: number | null
          rfm_frequency?: number | null
          rfm_monetary?: number | null
          rfm_segment?: string | null
          tags?: string[] | null
        }
        Relationships: []
      }
      bestseller_candidates: {
        Row: {
          id: string
          user_id: string
          product_id: string
          score: number
          sales_velocity: number
          margin_pct: number
          consistency_score: number | null
          pipeline_stage: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          product_id: string
          score?: number
          sales_velocity?: number
          margin_pct?: number
          consistency_score?: number | null
          pipeline_stage?: string
          notes?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          product_id?: string
          score?: number
          sales_velocity?: number
          margin_pct?: number
          consistency_score?: number | null
          pipeline_stage?: string
          notes?: string | null
        }
        Relationships: []
      }
      sync_jobs: {
        Row: {
          id: string
          user_id: string
          job_type: string
          status: string
          priority: number
          scheduled_at: string
          started_at: string | null
          completed_at: string | null
          records_processed: number
          error_message: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          job_type: string
          status?: string
          priority?: number
          scheduled_at?: string
          started_at?: string | null
          completed_at?: string | null
          records_processed?: number
          error_message?: string | null
          metadata?: Json
        }
        Update: {
          id?: string
          user_id?: string
          job_type?: string
          status?: string
          priority?: number
          scheduled_at?: string
          started_at?: string | null
          completed_at?: string | null
          records_processed?: number
          error_message?: string | null
          metadata?: Json
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          id: string
          user_id: string
          job_id: string | null
          platform: string
          sync_type: string
          status: string
          records_synced: number
          error_message: string | null
          metadata: Json
          started_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          job_id?: string | null
          platform: string
          sync_type: string
          status?: string
          records_synced?: number
          error_message?: string | null
          metadata?: Json
          started_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          job_id?: string | null
          platform?: string
          sync_type?: string
          status?: string
          records_synced?: number
          error_message?: string | null
          metadata?: Json
          started_at?: string
          completed_at?: string | null
        }
        Relationships: []
      }
      daily_financials: {
        Row: {
          id: string
          user_id: string
          date: string
          platform: string
          order_count: number
          gross_revenue_cents: number
          shipping_revenue_cents: number
          tax_collected_cents: number
          discount_cents: number
          cogs_cents: number
          platform_fee_cents: number
          transaction_fee_cents: number
          payment_processing_fee_cents: number
          listing_fee_cents: number
          shipping_cost_cents: number
          net_revenue_cents: number
          profit_cents: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date: string
          platform: string
          order_count?: number
          gross_revenue_cents?: number
          shipping_revenue_cents?: number
          tax_collected_cents?: number
          discount_cents?: number
          cogs_cents?: number
          platform_fee_cents?: number
          transaction_fee_cents?: number
          payment_processing_fee_cents?: number
          listing_fee_cents?: number
          shipping_cost_cents?: number
          net_revenue_cents?: number
          profit_cents?: number
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          platform?: string
          order_count?: number
          gross_revenue_cents?: number
          shipping_revenue_cents?: number
          tax_collected_cents?: number
          discount_cents?: number
          cogs_cents?: number
          platform_fee_cents?: number
          transaction_fee_cents?: number
          payment_processing_fee_cents?: number
          listing_fee_cents?: number
          shipping_cost_cents?: number
          net_revenue_cents?: number
          profit_cents?: number
        }
        Relationships: []
      }
      monthly_pnl: {
        Row: {
          id: string
          user_id: string
          year: number
          month: number
          platform: string
          order_count: number
          gross_revenue_cents: number
          total_fees_cents: number
          cogs_cents: number
          net_revenue_cents: number
          profit_cents: number
          margin_pct: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          year: number
          month: number
          platform: string
          order_count?: number
          gross_revenue_cents?: number
          total_fees_cents?: number
          cogs_cents?: number
          net_revenue_cents?: number
          profit_cents?: number
          margin_pct?: number
        }
        Update: {
          id?: string
          user_id?: string
          year?: number
          month?: number
          platform?: string
          order_count?: number
          gross_revenue_cents?: number
          total_fees_cents?: number
          cogs_cents?: number
          net_revenue_cents?: number
          profit_cents?: number
          margin_pct?: number
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          id: string
          user_id: string
          email: string
          beehiiv_subscriber_id: string | null
          beehiiv_status: string
          substack_status: string
          tags: Json
          segments: Json
          utm_source: string | null
          utm_medium: string | null
          utm_campaign: string | null
          beehiiv_created_at: string | null
          synced_to_substack_at: string | null
          last_webhook_at: string | null
          error_message: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          email: string
          beehiiv_subscriber_id?: string | null
          beehiiv_status?: string
          substack_status?: string
          tags?: Json
          segments?: Json
          utm_source?: string | null
          utm_medium?: string | null
          utm_campaign?: string | null
          beehiiv_created_at?: string | null
          synced_to_substack_at?: string | null
          last_webhook_at?: string | null
          error_message?: string | null
          metadata?: Json
        }
        Update: {
          id?: string
          user_id?: string
          email?: string
          beehiiv_subscriber_id?: string | null
          beehiiv_status?: string
          substack_status?: string
          tags?: Json
          segments?: Json
          utm_source?: string | null
          utm_medium?: string | null
          utm_campaign?: string | null
          beehiiv_created_at?: string | null
          synced_to_substack_at?: string | null
          last_webhook_at?: string | null
          error_message?: string | null
          metadata?: Json
        }
        Relationships: []
      }
      newsletter_sync_log: {
        Row: {
          id: string
          user_id: string
          subscriber_id: string | null
          action: string
          source: string
          status: string
          error_message: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          subscriber_id?: string | null
          action: string
          source: string
          status?: string
          error_message?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          subscriber_id?: string | null
          action?: string
          source?: string
          status?: string
          error_message?: string | null
          metadata?: Json
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_order_count: { Args: { p_user_id: string }; Returns: undefined }
      reset_monthly_counts: { Args: { p_user_id: string }; Returns: undefined }
      check_plan_limit: { Args: { p_user_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
