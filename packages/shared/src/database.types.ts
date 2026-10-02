
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "affiliate_programs": {
                  Row: {
                    "commission_notes": string | null,"created_at": string,"id": string,"is_active": boolean,"network": string,"retailer_id": string,"tag_template": string,"updated_at": string
                  }
                  Insert: {
                    "commission_notes"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"network": string,"retailer_id": string,"tag_template": string,"updated_at"?: string
                  }
                  Update: {
                    "commission_notes"?: string | null,"created_at"?: string,"id"?: string,"is_active"?: boolean,"network"?: string,"retailer_id"?: string,"tag_template"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "affiliate_programs_retailer_id_fkey"
      columns: ["retailer_id"]
isOneToOne: true
      referencedRelation: "retailers"
      referencedColumns: ["id"]
    }
                  ]
                },"brands": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"logo_path": string | null,"name": string,"slug": string,"updated_at": string,"website_url": string | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"logo_path"?: string | null,"name": string,"slug": string,"updated_at"?: string,"website_url"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"logo_path"?: string | null,"name"?: string,"slug"?: string,"updated_at"?: string,"website_url"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"categories": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"name": string,"parent_id": string | null,"slug": string,"sort": number,"updated_at": string,"variant_axes": (string)[]
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"parent_id"?: string | null,"slug": string,"sort"?: number,"updated_at"?: string,"variant_axes"?: (string)[]
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"parent_id"?: string | null,"slug"?: string,"sort"?: number,"updated_at"?: string,"variant_axes"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "category_summaries"
      referencedColumns: ["id"]
    }
                  ]
                },"ingestion_runs": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"report": NonNullable<Json>,"source_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"report"?: NonNullable<Json>,"source_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"report"?: NonNullable<Json>,"source_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ingestion_runs_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "ingestion_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"ingestion_sources": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"kind": Database["public"]['Enums']["ingestion_kind"],"name": string,"retailer_id": string | null,"slug": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"kind": Database["public"]['Enums']["ingestion_kind"],"name": string,"retailer_id"?: string | null,"slug": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"kind"?: Database["public"]['Enums']["ingestion_kind"],"name"?: string,"retailer_id"?: string | null,"slug"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ingestion_sources_retailer_id_fkey"
      columns: ["retailer_id"]
isOneToOne: false
      referencedRelation: "retailers"
      referencedColumns: ["id"]
    }
                  ]
                },"outbound_clicks": {
                  Row: {
                    "created_at": string,"id": number,"offer_id": string | null,"placement": string | null,"promo_id": string | null,"user_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: never,"offer_id"?: string | null,"placement"?: string | null,"promo_id"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"offer_id"?: string | null,"placement"?: string | null,"promo_id"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "outbound_clicks_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "retailer_offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outbound_clicks_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "variant_offer_ranking"
      referencedColumns: ["offer_id"]
    },{
      foreignKeyName: "outbound_clicks_promo_id_fkey"
      columns: ["promo_id"]
isOneToOne: false
      referencedRelation: "live_promo_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outbound_clicks_promo_id_fkey"
      columns: ["promo_id"]
isOneToOne: false
      referencedRelation: "promo_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outbound_clicks_promo_id_fkey"
      columns: ["promo_id"]
isOneToOne: false
      referencedRelation: "variant_offer_ranking"
      referencedColumns: ["promo_id"]
    }
                  ]
                },"price_points": {
                  Row: {
                    "active": boolean,"id": number,"in_stock": boolean,"observed_at": string,"offer_id": string,"price_cents": number | null,"price_display": Database["public"]['Enums']["price_display"],"shipping_cents": number
                  }
                  Insert: {
                    "active"?: boolean,"id"?: never,"in_stock": boolean,"observed_at"?: string,"offer_id": string,"price_cents"?: number | null,"price_display": Database["public"]['Enums']["price_display"],"shipping_cents"?: number
                  }
                  Update: {
                    "active"?: boolean,"id"?: never,"in_stock"?: boolean,"observed_at"?: string,"offer_id"?: string,"price_cents"?: number | null,"price_display"?: Database["public"]['Enums']["price_display"],"shipping_cents"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "price_points_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "retailer_offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "price_points_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "variant_offer_ranking"
      referencedColumns: ["offer_id"]
    }
                  ]
                },"product_aliases": {
                  Row: {
                    "alias": string,"created_at": string,"id": string,"product_id": string
                  }
                  Insert: {
                    "alias": string,"created_at"?: string,"id"?: string,"product_id": string
                  }
                  Update: {
                    "alias"?: string,"created_at"?: string,"id"?: string,"product_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_aliases_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_identifiers": {
                  Row: {
                    "created_at": string,"id": string,"kind": Database["public"]['Enums']["identifier_kind"],"retailer_id": string | null,"value": string,"variant_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind": Database["public"]['Enums']["identifier_kind"],"retailer_id"?: string | null,"value": string,"variant_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["identifier_kind"],"retailer_id"?: string | null,"value"?: string,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_identifiers_retailer_fk"
      columns: ["retailer_id"]
isOneToOne: false
      referencedRelation: "retailers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_identifiers_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"product_images": {
                  Row: {
                    "added_by": string | null,"blurhash": string | null,"created_at": string,"height": number | null,"id": string,"is_cutout": boolean,"license_note": string | null,"product_id": string,"rights_expires_at": string | null,"sort": number,"source": Database["public"]['Enums']["image_source"],"source_url": string | null,"status": Database["public"]['Enums']["image_status"],"storage_path": string,"updated_at": string,"variant_id": string | null,"width": number | null
                  }
                  Insert: {
                    "added_by"?: string | null,"blurhash"?: string | null,"created_at"?: string,"height"?: number | null,"id"?: string,"is_cutout"?: boolean,"license_note"?: string | null,"product_id": string,"rights_expires_at"?: string | null,"sort"?: number,"source": Database["public"]['Enums']["image_source"],"source_url"?: string | null,"status"?: Database["public"]['Enums']["image_status"],"storage_path": string,"updated_at"?: string,"variant_id"?: string | null,"width"?: number | null
                  }
                  Update: {
                    "added_by"?: string | null,"blurhash"?: string | null,"created_at"?: string,"height"?: number | null,"id"?: string,"is_cutout"?: boolean,"license_note"?: string | null,"product_id"?: string,"rights_expires_at"?: string | null,"sort"?: number,"source"?: Database["public"]['Enums']["image_source"],"source_url"?: string | null,"status"?: Database["public"]['Enums']["image_status"],"storage_path"?: string,"updated_at"?: string,"variant_id"?: string | null,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_images_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_images_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"product_variants": {
                  Row: {
                    "attributes": NonNullable<Json>,"created_at": string,"id": string,"is_default": boolean,"label": string,"msrp_cents": number | null,"product_id": string,"sort": number,"updated_at": string
                  }
                  Insert: {
                    "attributes"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"is_default"?: boolean,"label": string,"msrp_cents"?: number | null,"product_id": string,"sort"?: number,"updated_at"?: string
                  }
                  Update: {
                    "attributes"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"is_default"?: boolean,"label"?: string,"msrp_cents"?: number | null,"product_id"?: string,"sort"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_variants_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "brand_id": string,"category_id": string,"created_at": string,"id": string,"model_year": number | null,"msrp_cents": number | null,"name": string,"search": unknown,"search_text": string,"slug": string,"specs": NonNullable<Json>,"status": Database["public"]['Enums']["product_status"],"updated_at": string
                  }
                  Insert: {
                    "brand_id": string,"category_id": string,"created_at"?: string,"id"?: string,"model_year"?: number | null,"msrp_cents"?: number | null,"name": string,"search"?: unknown,"search_text"?: string,"slug": string,"specs"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["product_status"],"updated_at"?: string
                  }
                  Update: {
                    "brand_id"?: string,"category_id"?: string,"created_at"?: string,"id"?: string,"model_year"?: number | null,"msrp_cents"?: number | null,"name"?: string,"search"?: unknown,"search_text"?: string,"slug"?: string,"specs"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["product_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brand_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "category_summaries"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "area_label": string | null,"avatar_path": string | null,"created_at": string,"display_name": string,"display_name_source": Database["public"]['Enums']["display_name_source"],"id": string,"member_since": string,"updated_at": string
                  }
                  Insert: {
                    "area_label"?: string | null,"avatar_path"?: string | null,"created_at"?: string,"display_name": string,"display_name_source"?: Database["public"]['Enums']["display_name_source"],"id": string,"member_since"?: string,"updated_at"?: string
                  }
                  Update: {
                    "area_label"?: string | null,"avatar_path"?: string | null,"created_at"?: string,"display_name"?: string,"display_name_source"?: Database["public"]['Enums']["display_name_source"],"id"?: string,"member_since"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles_private": {
                  Row: {
                    "appearance": string | null,"created_at": string,"search_radius_m": number,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "appearance"?: string | null,"created_at"?: string,"search_radius_m"?: number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "appearance"?: string | null,"created_at"?: string,"search_radius_m"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"promo_code_targets": {
                  Row: {
                    "category_id": string | null,"id": string,"product_id": string | null,"promo_id": string,"variant_id": string | null
                  }
                  Insert: {
                    "category_id"?: string | null,"id"?: string,"product_id"?: string | null,"promo_id": string,"variant_id"?: string | null
                  }
                  Update: {
                    "category_id"?: string | null,"id"?: string,"product_id"?: string | null,"promo_id"?: string,"variant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "promo_code_targets_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promo_code_targets_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "category_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promo_code_targets_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promo_code_targets_promo_id_fkey"
      columns: ["promo_id"]
isOneToOne: false
      referencedRelation: "live_promo_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promo_code_targets_promo_id_fkey"
      columns: ["promo_id"]
isOneToOne: false
      referencedRelation: "promo_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promo_code_targets_promo_id_fkey"
      columns: ["promo_id"]
isOneToOne: false
      referencedRelation: "variant_offer_ranking"
      referencedColumns: ["promo_id"]
    },{
      foreignKeyName: "promo_code_targets_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"promo_codes": {
                  Row: {
                    "brand_id": string | null,"code": string,"created_at": string,"created_by": string | null,"discount_type": Database["public"]['Enums']["discount_type"],"discount_value": number,"ends_at": string | null,"id": string,"is_exclusive": boolean,"min_purchase_cents": number,"retailer_id": string,"source_id": string | null,"starts_at": string | null,"status": Database["public"]['Enums']["promo_status"],"terms": string | null,"title": string,"updated_at": string,"verified_at": string | null,"promo_is_live": boolean | null
                  }
                  Insert: {
                    "brand_id"?: string | null,"code": string,"created_at"?: string,"created_by"?: string | null,"discount_type": Database["public"]['Enums']["discount_type"],"discount_value": number,"ends_at"?: string | null,"id"?: string,"is_exclusive"?: boolean,"min_purchase_cents"?: number,"retailer_id": string,"source_id"?: string | null,"starts_at"?: string | null,"status"?: Database["public"]['Enums']["promo_status"],"terms"?: string | null,"title": string,"updated_at"?: string,"verified_at"?: string | null
                  }
                  Update: {
                    "brand_id"?: string | null,"code"?: string,"created_at"?: string,"created_by"?: string | null,"discount_type"?: Database["public"]['Enums']["discount_type"],"discount_value"?: number,"ends_at"?: string | null,"id"?: string,"is_exclusive"?: boolean,"min_purchase_cents"?: number,"retailer_id"?: string,"source_id"?: string | null,"starts_at"?: string | null,"status"?: Database["public"]['Enums']["promo_status"],"terms"?: string | null,"title"?: string,"updated_at"?: string,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "promo_codes_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brand_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promo_codes_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promo_codes_retailer_id_fkey"
      columns: ["retailer_id"]
isOneToOne: false
      referencedRelation: "retailers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promo_codes_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "ingestion_sources"
      referencedColumns: ["id"]
    }
                  ]
                },"raw_offer_records": {
                  Row: {
                    "asin": string | null,"available_sizes": (string)[] | null,"brand_text": string | null,"created_at": string,"ean": string | null,"error": string | null,"external_ref": string | null,"gtin": string | null,"id": string,"in_stock": boolean | null,"match_confidence": number | null,"match_method": string | null,"match_status": Database["public"]['Enums']["match_status"],"matched_variant_id": string | null,"mpn": string | null,"offer_id": string | null,"payload": NonNullable<Json>,"price_cents": number | null,"resolved_at": string | null,"resolved_by": string | null,"retailer_id": string | null,"retailer_sku": string | null,"run_id": string,"shipping_cents": number | null,"suggestions": NonNullable<Json>,"title": string | null,"upc": string | null,"url": string | null
                  }
                  Insert: {
                    "asin"?: string | null,"available_sizes"?: (string)[] | null,"brand_text"?: string | null,"created_at"?: string,"ean"?: string | null,"error"?: string | null,"external_ref"?: string | null,"gtin"?: string | null,"id"?: string,"in_stock"?: boolean | null,"match_confidence"?: number | null,"match_method"?: string | null,"match_status"?: Database["public"]['Enums']["match_status"],"matched_variant_id"?: string | null,"mpn"?: string | null,"offer_id"?: string | null,"payload": NonNullable<Json>,"price_cents"?: number | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"retailer_id"?: string | null,"retailer_sku"?: string | null,"run_id": string,"shipping_cents"?: number | null,"suggestions"?: NonNullable<Json>,"title"?: string | null,"upc"?: string | null,"url"?: string | null
                  }
                  Update: {
                    "asin"?: string | null,"available_sizes"?: (string)[] | null,"brand_text"?: string | null,"created_at"?: string,"ean"?: string | null,"error"?: string | null,"external_ref"?: string | null,"gtin"?: string | null,"id"?: string,"in_stock"?: boolean | null,"match_confidence"?: number | null,"match_method"?: string | null,"match_status"?: Database["public"]['Enums']["match_status"],"matched_variant_id"?: string | null,"mpn"?: string | null,"offer_id"?: string | null,"payload"?: NonNullable<Json>,"price_cents"?: number | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"retailer_id"?: string | null,"retailer_sku"?: string | null,"run_id"?: string,"shipping_cents"?: number | null,"suggestions"?: NonNullable<Json>,"title"?: string | null,"upc"?: string | null,"url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "raw_offer_records_matched_variant_id_fkey"
      columns: ["matched_variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "raw_offer_records_retailer_id_fkey"
      columns: ["retailer_id"]
isOneToOne: false
      referencedRelation: "retailers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "raw_offer_records_run_id_fkey"
      columns: ["run_id"]
isOneToOne: false
      referencedRelation: "ingestion_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"retailer_offers": {
                  Row: {
                    "available_sizes": (string)[],"created_at": string,"external_ref": string | null,"first_seen_at": string,"id": string,"in_stock": boolean,"last_changed_at": string,"last_checked_at": string,"price_cents": number | null,"price_display": Database["public"]['Enums']["price_display"],"price_source": Database["public"]['Enums']["price_source"],"retailer_id": string,"shipping_cents": number,"source_id": string | null,"status": Database["public"]['Enums']["offer_status"],"updated_at": string,"url": string,"variant_id": string
                  }
                  Insert: {
                    "available_sizes"?: (string)[],"created_at"?: string,"external_ref"?: string | null,"first_seen_at"?: string,"id"?: string,"in_stock"?: boolean,"last_changed_at"?: string,"last_checked_at"?: string,"price_cents"?: number | null,"price_display": Database["public"]['Enums']["price_display"],"price_source"?: Database["public"]['Enums']["price_source"],"retailer_id": string,"shipping_cents"?: number,"source_id"?: string | null,"status"?: Database["public"]['Enums']["offer_status"],"updated_at"?: string,"url": string,"variant_id": string
                  }
                  Update: {
                    "available_sizes"?: (string)[],"created_at"?: string,"external_ref"?: string | null,"first_seen_at"?: string,"id"?: string,"in_stock"?: boolean,"last_changed_at"?: string,"last_checked_at"?: string,"price_cents"?: number | null,"price_display"?: Database["public"]['Enums']["price_display"],"price_source"?: Database["public"]['Enums']["price_source"],"retailer_id"?: string,"shipping_cents"?: number,"source_id"?: string | null,"status"?: Database["public"]['Enums']["offer_status"],"updated_at"?: string,"url"?: string,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "retailer_offers_retailer_id_fkey"
      columns: ["retailer_id"]
isOneToOne: false
      referencedRelation: "retailers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "retailer_offers_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "ingestion_sources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "retailer_offers_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"retailers": {
                  Row: {
                    "created_at": string,"domain": string,"id": string,"is_active": boolean,"kind": Database["public"]['Enums']["retailer_kind"],"logo_path": string | null,"name": string,"price_display_default": Database["public"]['Enums']["price_display"],"slug": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"domain": string,"id"?: string,"is_active"?: boolean,"kind"?: Database["public"]['Enums']["retailer_kind"],"logo_path"?: string | null,"name": string,"price_display_default"?: Database["public"]['Enums']["price_display"],"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"domain"?: string,"id"?: string,"is_active"?: boolean,"kind"?: Database["public"]['Enums']["retailer_kind"],"logo_path"?: string | null,"name"?: string,"price_display_default"?: Database["public"]['Enums']["price_display"],"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_roles": {
                  Row: {
                    "granted_at": string,"granted_by": string | null,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Insert: {
                    "granted_at"?: string,"granted_by"?: string | null,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"variant_price_stats": {
                  Row: {
                    "best_delivered_cents": number | null,"best_offer_id": string | null,"best_price_cents": number | null,"deal_quality": Database["public"]['Enums']["deal_quality"] | null,"history_days": number,"low_30d_cents": number | null,"low_90d_cents": number | null,"low_all_time_cents": number | null,"offer_count": number,"typical_cents": number | null,"updated_at": string,"variant_id": string
                  }
                  Insert: {
                    "best_delivered_cents"?: number | null,"best_offer_id"?: string | null,"best_price_cents"?: number | null,"deal_quality"?: Database["public"]['Enums']["deal_quality"] | null,"history_days"?: number,"low_30d_cents"?: number | null,"low_90d_cents"?: number | null,"low_all_time_cents"?: number | null,"offer_count"?: number,"typical_cents"?: number | null,"updated_at"?: string,"variant_id": string
                  }
                  Update: {
                    "best_delivered_cents"?: number | null,"best_offer_id"?: string | null,"best_price_cents"?: number | null,"deal_quality"?: Database["public"]['Enums']["deal_quality"] | null,"history_days"?: number,"low_30d_cents"?: number | null,"low_90d_cents"?: number | null,"low_all_time_cents"?: number | null,"offer_count"?: number,"typical_cents"?: number | null,"updated_at"?: string,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "variant_price_stats_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: true
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "brand_summaries": {
                  Row: {
                    "id": string | null,"logo_path": string | null,"name": string | null,"product_count": number | null,"slug": string | null
                  }
                  Relationships: [
                    
                  ]
                },"category_summaries": {
                  Row: {
                    "id": string | null,"name": string | null,"parent_id": string | null,"product_count": number | null,"slug": string | null,"sort": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "category_summaries"
      referencedColumns: ["id"]
    }
                  ]
                },"live_promo_codes": {
                  Row: {
                    "brand_id": string | null,"code": string | null,"discount_type": Database["public"]['Enums']["discount_type"] | null,"discount_value": number | null,"ends_at": string | null,"id": string | null,"is_exclusive": boolean | null,"min_purchase_cents": number | null,"retailer_id": string | null,"retailer_name": string | null,"retailer_slug": string | null,"terms": string | null,"title": string | null,"verified_at": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "promo_codes_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brand_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promo_codes_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "promo_codes_retailer_id_fkey"
      columns: ["retailer_id"]
isOneToOne: false
      referencedRelation: "retailers"
      referencedColumns: ["id"]
    }
                  ]
                },"variant_offer_ranking": {
                  Row: {
                    "available_sizes": (string)[] | null,"delivered_cents": number | null,"in_stock": boolean | null,"last_checked_at": string | null,"offer_id": string | null,"price_cents": number | null,"price_display": Database["public"]['Enums']["price_display"] | null,"product_id": string | null,"promo_code": string | null,"promo_discount_cents": number | null,"promo_id": string | null,"rank": number | null,"retailer_id": string | null,"retailer_kind": Database["public"]['Enums']["retailer_kind"] | null,"retailer_name": string | null,"retailer_slug": string | null,"shipping_cents": number | null,"variant_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_variants_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "retailer_offers_retailer_id_fkey"
      columns: ["retailer_id"]
isOneToOne: false
      referencedRelation: "retailers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "retailer_offers_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "apply_raw_offer":
{ Args: { "raw_id": string,"vid": string }; Returns: Json
                           },
"custom_access_token_hook":
{ Args: { "event": Json }; Returns: Json
                           },
"import_catalog":
{ Args: { "dry_run"?: boolean,"payload": Json }; Returns: Json
                           },
"ingest_offers":
{ Args: { "dry_run"?: boolean,"records": Json,"source": string }; Returns: Json
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"price_history":
{ Args: { "days"?: number,"retailer_slug"?: string,"variant": string }; Returns: {
              "day": string,"low_cents": number
            }[]
                           },
"product_is_public":
{ Args: { "pid": string }; Returns: boolean
                           },
"promo_discount_cents":
{ Args: { "p": Database["public"]['Tables']["promo_codes"]['Row'],"price_cents": number,"shipping_cents": number }; Returns: number
                           },
"promo_is_live":
{ Args: { "p": Database["public"]['Tables']["promo_codes"]['Row'] }; Returns: boolean
                           },
"recent_price_changes":
{ Args: { "max_rows"?: number,"variant": string }; Returns: {
              "observed_at": string,"previous_cents": number,"price_cents": number,"retailer_name": string
            }[]
                           },
"refresh_variant_price_stats":
{ Args: { "vid": string }; Returns: undefined
                           },
"reject_raw_offer":
{ Args: { "raw_id": string }; Returns: undefined
                           },
"resolve_raw_offer":
{ Args: { "raw_id": string,"remember"?: boolean,"variant": string }; Returns: Json
                           },
"search_catalog":
{ Args: { "product_limit"?: number,"q": string }; Returns: Json
                           },
"suggest_catalog_matches":
{ Args: { "brand"?: string,"max_rows"?: number,"title": string }; Returns: Json
                           },
"variant_daily_lows":
{ Args: { "days": number,"retailer"?: string,"vid": string }; Returns: {
              "day": string,"low_cents": number
            }[]
                           }
          }
          Enums: {
            "app_role": "admin"|"editor","deal_quality": "above_typical"|"typical"|"good"|"excellent"|"all_time_low","discount_type": "percent"|"amount"|"free_ship","display_name_source": "generated"|"provided","identifier_kind": "gtin"|"upc"|"ean"|"asin"|"mpn"|"retailer_sku","image_source": "brand_supplied"|"manufacturer_site"|"retailer_feed"|"affiliate_feed"|"owned","image_status": "active"|"pending_review"|"removed","ingestion_kind": "manual"|"csv"|"feed"|"api","match_status": "matched"|"unmatched"|"rejected","offer_status": "active"|"inactive","price_display": "show"|"check_price","price_source": "manual"|"feed"|"api","product_status": "draft"|"active"|"discontinued","promo_status": "active"|"removed","retailer_kind": "marketplace"|"retailer"|"manufacturer"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "app_role": ["admin", "editor"],"deal_quality": ["above_typical", "typical", "good", "excellent", "all_time_low"],"discount_type": ["percent", "amount", "free_ship"],"display_name_source": ["generated", "provided"],"identifier_kind": ["gtin", "upc", "ean", "asin", "mpn", "retailer_sku"],"image_source": ["brand_supplied", "manufacturer_site", "retailer_feed", "affiliate_feed", "owned"],"image_status": ["active", "pending_review", "removed"],"ingestion_kind": ["manual", "csv", "feed", "api"],"match_status": ["matched", "unmatched", "rejected"],"offer_status": ["active", "inactive"],"price_display": ["show", "check_price"],"price_source": ["manual", "feed", "api"],"product_status": ["draft", "active", "discontinued"],"promo_status": ["active", "removed"],"retailer_kind": ["marketplace", "retailer", "manufacturer"]
          }
        }
} as const
