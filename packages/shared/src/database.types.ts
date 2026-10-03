
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
                },"agreements": {
                  Row: {
                    "amount_cents": number,"buyer_id": string | null,"created_at": string,"id": string,"listing_id": string,"offer_id": string,"seller_id": string | null
                  }
                  Insert: {
                    "amount_cents": number,"buyer_id"?: string | null,"created_at"?: string,"id"?: string,"listing_id": string,"offer_id": string,"seller_id"?: string | null
                  }
                  Update: {
                    "amount_cents"?: number,"buyer_id"?: string | null,"created_at"?: string,"id"?: string,"listing_id"?: string,"offer_id"?: string,"seller_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "agreements_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agreements_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: true
      referencedRelation: "marketplace_offers"
      referencedColumns: ["id"]
    }
                  ]
                },"brand_follows": {
                  Row: {
                    "brand_id": string,"created_at": string,"user_id": string
                  }
                  Insert: {
                    "brand_id": string,"created_at"?: string,"user_id": string
                  }
                  Update: {
                    "brand_id"?: string,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "brand_follows_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brand_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "brand_follows_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
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
                },"collection_items": {
                  Row: {
                    "collection_id": string,"deal_id": string | null,"id": string,"product_id": string | null,"sort": number
                  }
                  Insert: {
                    "collection_id": string,"deal_id"?: string | null,"id"?: string,"product_id"?: string | null,"sort"?: number
                  }
                  Update: {
                    "collection_id"?: string,"deal_id"?: string | null,"id"?: string,"product_id"?: string | null,"sort"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "collection_items_collection_id_fkey"
      columns: ["collection_id"]
isOneToOne: false
      referencedRelation: "collections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "collection_items_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deal_feed"
      referencedColumns: ["deal_id"]
    },{
      foreignKeyName: "collection_items_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "collection_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "deal_feed"
      referencedColumns: ["product_id"]
    },{
      foreignKeyName: "collection_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"collections": {
                  Row: {
                    "created_at": string,"ends_at": string | null,"eyebrow": string | null,"id": string,"is_active": boolean,"kind": Database["public"]['Enums']["collection_kind"],"slug": string,"sort": number,"starts_at": string | null,"subtitle": string | null,"title": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"ends_at"?: string | null,"eyebrow"?: string | null,"id"?: string,"is_active"?: boolean,"kind"?: Database["public"]['Enums']["collection_kind"],"slug": string,"sort"?: number,"starts_at"?: string | null,"subtitle"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"ends_at"?: string | null,"eyebrow"?: string | null,"id"?: string,"is_active"?: boolean,"kind"?: Database["public"]['Enums']["collection_kind"],"slug"?: string,"sort"?: number,"starts_at"?: string | null,"subtitle"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"conversation_participants": {
                  Row: {
                    "archived_at": string | null,"conversation_id": string,"last_read_at": string | null,"last_read_message_id": number,"muted": boolean,"role": string,"user_id": string,"viewing_until": string | null
                  }
                  Insert: {
                    "archived_at"?: string | null,"conversation_id": string,"last_read_at"?: string | null,"last_read_message_id"?: number,"muted"?: boolean,"role": string,"user_id": string,"viewing_until"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"conversation_id"?: string,"last_read_at"?: string | null,"last_read_message_id"?: number,"muted"?: boolean,"role"?: string,"user_id"?: string,"viewing_until"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversation_participants_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    }
                  ]
                },"conversations": {
                  Row: {
                    "buyer_id": string | null,"created_at": string,"id": string,"last_message_at": string | null,"last_message_id": number | null,"last_message_preview": string | null,"last_message_sender": string | null,"listing_id": string,"seller_id": string | null
                  }
                  Insert: {
                    "buyer_id"?: string | null,"created_at"?: string,"id"?: string,"last_message_at"?: string | null,"last_message_id"?: number | null,"last_message_preview"?: string | null,"last_message_sender"?: string | null,"listing_id": string,"seller_id"?: string | null
                  }
                  Update: {
                    "buyer_id"?: string | null,"created_at"?: string,"id"?: string,"last_message_at"?: string | null,"last_message_id"?: number | null,"last_message_preview"?: string | null,"last_message_sender"?: string | null,"listing_id"?: string,"seller_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "conversations_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"deals": {
                  Row: {
                    "created_at": string,"created_by": string | null,"drop_7d_cents": number,"ends_at": string | null,"headline": string,"id": string,"is_staff_pick": boolean,"kind": Database["public"]['Enums']["deal_kind"],"offer_id": string | null,"origin": Database["public"]['Enums']["deal_origin"],"reference_cents": number | null,"starts_at": string,"status": Database["public"]['Enums']["deal_status"],"updated_at": string,"variant_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"drop_7d_cents"?: number,"ends_at"?: string | null,"headline": string,"id"?: string,"is_staff_pick"?: boolean,"kind": Database["public"]['Enums']["deal_kind"],"offer_id"?: string | null,"origin": Database["public"]['Enums']["deal_origin"],"reference_cents"?: number | null,"starts_at"?: string,"status"?: Database["public"]['Enums']["deal_status"],"updated_at"?: string,"variant_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"drop_7d_cents"?: number,"ends_at"?: string | null,"headline"?: string,"id"?: string,"is_staff_pick"?: boolean,"kind"?: Database["public"]['Enums']["deal_kind"],"offer_id"?: string | null,"origin"?: Database["public"]['Enums']["deal_origin"],"reference_cents"?: number | null,"starts_at"?: string,"status"?: Database["public"]['Enums']["deal_status"],"updated_at"?: string,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deals_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "deal_feed"
      referencedColumns: ["offer_id"]
    },{
      foreignKeyName: "deals_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "retailer_offers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deals_offer_id_fkey"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "variant_offer_ranking"
      referencedColumns: ["offer_id"]
    },{
      foreignKeyName: "deals_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
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
                },"listing_catalog_reviews": {
                  Row: {
                    "created_at": string,"decision": Database["public"]['Enums']["catalog_review_decision"],"id": string,"listing_id": string,"notes": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"suggested_product_id": string | null,"suggestions": NonNullable<Json>
                  }
                  Insert: {
                    "created_at"?: string,"decision"?: Database["public"]['Enums']["catalog_review_decision"],"id"?: string,"listing_id": string,"notes"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"suggested_product_id"?: string | null,"suggestions"?: NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"decision"?: Database["public"]['Enums']["catalog_review_decision"],"id"?: string,"listing_id"?: string,"notes"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"suggested_product_id"?: string | null,"suggestions"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_catalog_reviews_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: true
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listing_catalog_reviews_suggested_product_id_fkey"
      columns: ["suggested_product_id"]
isOneToOne: false
      referencedRelation: "deal_feed"
      referencedColumns: ["product_id"]
    },{
      foreignKeyName: "listing_catalog_reviews_suggested_product_id_fkey"
      columns: ["suggested_product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"listing_images": {
                  Row: {
                    "blurhash": string | null,"created_at": string,"height": number | null,"id": string,"listing_id": string,"sort": number,"storage_path": string,"width": number | null
                  }
                  Insert: {
                    "blurhash"?: string | null,"created_at"?: string,"height"?: number | null,"id"?: string,"listing_id": string,"sort"?: number,"storage_path": string,"width"?: number | null
                  }
                  Update: {
                    "blurhash"?: string | null,"created_at"?: string,"height"?: number | null,"id"?: string,"listing_id"?: string,"sort"?: number,"storage_path"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_images_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"listing_locations": {
                  Row: {
                    "area_label": string,"geohash6": string,"listing_id": string,"postal_code": string | null,"public_point": unknown
                  }
                  Insert: {
                    "area_label": string,"geohash6": string,"listing_id": string,"postal_code"?: string | null,"public_point": unknown
                  }
                  Update: {
                    "area_label"?: string,"geohash6"?: string,"listing_id"?: string,"postal_code"?: string | null,"public_point"?: unknown
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_locations_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: true
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"listing_private": {
                  Row: {
                    "hide_offers_below_cents": number | null,"listing_id": string
                  }
                  Insert: {
                    "hide_offers_below_cents"?: number | null,"listing_id": string
                  }
                  Update: {
                    "hide_offers_below_cents"?: number | null,"listing_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "listing_private_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: true
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"listings": {
                  Row: {
                    "accepts_offers": boolean,"brand_id": string | null,"category_id": string,"condition": Database["public"]['Enums']["listing_condition"],"created_at": string,"custom_brand_text": string | null,"custom_title": string | null,"description": string,"id": string,"pickup": boolean,"price_cents": number,"product_id": string | null,"published_at": string | null,"removed_at": string | null,"removed_by_staff": boolean,"removed_reason": string | null,"seller_id": string,"ships": boolean,"sold_at": string | null,"sold_price_cents": number | null,"sold_to_user_id": string | null,"status": Database["public"]['Enums']["listing_status"],"updated_at": string,"variant_id": string | null
                  }
                  Insert: {
                    "accepts_offers"?: boolean,"brand_id"?: string | null,"category_id": string,"condition": Database["public"]['Enums']["listing_condition"],"created_at"?: string,"custom_brand_text"?: string | null,"custom_title"?: string | null,"description"?: string,"id"?: string,"pickup"?: boolean,"price_cents": number,"product_id"?: string | null,"published_at"?: string | null,"removed_at"?: string | null,"removed_by_staff"?: boolean,"removed_reason"?: string | null,"seller_id": string,"ships"?: boolean,"sold_at"?: string | null,"sold_price_cents"?: number | null,"sold_to_user_id"?: string | null,"status"?: Database["public"]['Enums']["listing_status"],"updated_at"?: string,"variant_id"?: string | null
                  }
                  Update: {
                    "accepts_offers"?: boolean,"brand_id"?: string | null,"category_id"?: string,"condition"?: Database["public"]['Enums']["listing_condition"],"created_at"?: string,"custom_brand_text"?: string | null,"custom_title"?: string | null,"description"?: string,"id"?: string,"pickup"?: boolean,"price_cents"?: number,"product_id"?: string | null,"published_at"?: string | null,"removed_at"?: string | null,"removed_by_staff"?: boolean,"removed_reason"?: string | null,"seller_id"?: string,"ships"?: boolean,"sold_at"?: string | null,"sold_price_cents"?: number | null,"sold_to_user_id"?: string | null,"status"?: Database["public"]['Enums']["listing_status"],"updated_at"?: string,"variant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "listings_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brand_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "category_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "deal_feed"
      referencedColumns: ["product_id"]
    },{
      foreignKeyName: "listings_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"marketplace_offers": {
                  Row: {
                    "amount_cents": number,"auto_declined": boolean,"buyer_id": string | null,"conversation_id": string,"created_at": string,"expires_at": string,"id": string,"listing_id": string,"message": string | null,"parent_offer_id": string | null,"proposed_by": string | null,"reminded_at": string | null,"responded_at": string | null,"seller_id": string | null,"status": Database["public"]['Enums']["marketplace_offer_status"]
                  }
                  Insert: {
                    "amount_cents": number,"auto_declined"?: boolean,"buyer_id"?: string | null,"conversation_id": string,"created_at"?: string,"expires_at"?: string,"id"?: string,"listing_id": string,"message"?: string | null,"parent_offer_id"?: string | null,"proposed_by"?: string | null,"reminded_at"?: string | null,"responded_at"?: string | null,"seller_id"?: string | null,"status"?: Database["public"]['Enums']["marketplace_offer_status"]
                  }
                  Update: {
                    "amount_cents"?: number,"auto_declined"?: boolean,"buyer_id"?: string | null,"conversation_id"?: string,"created_at"?: string,"expires_at"?: string,"id"?: string,"listing_id"?: string,"message"?: string | null,"parent_offer_id"?: string | null,"proposed_by"?: string | null,"reminded_at"?: string | null,"responded_at"?: string | null,"seller_id"?: string | null,"status"?: Database["public"]['Enums']["marketplace_offer_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "marketplace_offers_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "marketplace_offers_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "marketplace_offers_parent_offer_id_fkey"
      columns: ["parent_offer_id"]
isOneToOne: false
      referencedRelation: "marketplace_offers"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "body": string | null,"client_id": string | null,"conversation_id": string,"created_at": string,"id": number,"image_path": string | null,"kind": Database["public"]['Enums']["message_kind"],"meta": NonNullable<Json>,"offer_id": string | null,"sender_id": string | null
                  }
                  Insert: {
                    "body"?: string | null,"client_id"?: string | null,"conversation_id": string,"created_at"?: string,"id"?: never,"image_path"?: string | null,"kind"?: Database["public"]['Enums']["message_kind"],"meta"?: NonNullable<Json>,"offer_id"?: string | null,"sender_id"?: string | null
                  }
                  Update: {
                    "body"?: string | null,"client_id"?: string | null,"conversation_id"?: string,"created_at"?: string,"id"?: never,"image_path"?: string | null,"kind"?: Database["public"]['Enums']["message_kind"],"meta"?: NonNullable<Json>,"offer_id"?: string | null,"sender_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_conversation_id_fkey"
      columns: ["conversation_id"]
isOneToOne: false
      referencedRelation: "conversations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_offer_fk"
      columns: ["offer_id"]
isOneToOne: false
      referencedRelation: "marketplace_offers"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_preferences": {
                  Row: {
                    "category": string,"in_app": boolean,"push": boolean,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "category": string,"in_app"?: boolean,"push"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "category"?: string,"in_app"?: boolean,"push"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "body": string,"created_at": string,"data": NonNullable<Json>,"dedupe_key": string,"held_until": string | null,"id": string,"push_error": string | null,"push_status": Database["public"]['Enums']["push_status"],"pushed_at": string | null,"read_at": string | null,"route": string | null,"title": string,"type": string,"user_id": string
                  }
                  Insert: {
                    "body": string,"created_at"?: string,"data"?: NonNullable<Json>,"dedupe_key": string,"held_until"?: string | null,"id"?: string,"push_error"?: string | null,"push_status"?: Database["public"]['Enums']["push_status"],"pushed_at"?: string | null,"read_at"?: string | null,"route"?: string | null,"title": string,"type": string,"user_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"data"?: NonNullable<Json>,"dedupe_key"?: string,"held_until"?: string | null,"id"?: string,"push_error"?: string | null,"push_status"?: Database["public"]['Enums']["push_status"],"pushed_at"?: string | null,"read_at"?: string | null,"route"?: string | null,"title"?: string,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
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
      referencedRelation: "deal_feed"
      referencedColumns: ["offer_id"]
    },{
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
      referencedRelation: "deal_feed"
      referencedColumns: ["promo_id"]
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
                },"placements": {
                  Row: {
                    "campaign": string,"collection_id": string | null,"created_at": string,"created_by": string | null,"deal_id": string | null,"ends_at": string | null,"id": string,"is_active": boolean,"kind": Database["public"]['Enums']["placement_kind"],"label": string,"product_id": string | null,"sort": number,"starts_at": string,"updated_at": string
                  }
                  Insert: {
                    "campaign": string,"collection_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deal_id"?: string | null,"ends_at"?: string | null,"id"?: string,"is_active"?: boolean,"kind": Database["public"]['Enums']["placement_kind"],"label"?: string,"product_id"?: string | null,"sort"?: number,"starts_at"?: string,"updated_at"?: string
                  }
                  Update: {
                    "campaign"?: string,"collection_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"deal_id"?: string | null,"ends_at"?: string | null,"id"?: string,"is_active"?: boolean,"kind"?: Database["public"]['Enums']["placement_kind"],"label"?: string,"product_id"?: string | null,"sort"?: number,"starts_at"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "placements_collection_id_fkey"
      columns: ["collection_id"]
isOneToOne: false
      referencedRelation: "collections"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "placements_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deal_feed"
      referencedColumns: ["deal_id"]
    },{
      foreignKeyName: "placements_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "placements_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "deal_feed"
      referencedColumns: ["product_id"]
    },{
      foreignKeyName: "placements_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"price_alerts": {
                  Row: {
                    "created_at": string,"id": string,"include_new": boolean,"include_used": boolean,"last_notified_at": string | null,"last_notified_cents": number | null,"product_id": string,"status": Database["public"]['Enums']["alert_status"],"target_cents": number,"updated_at": string,"user_id": string,"variant_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"include_new"?: boolean,"include_used"?: boolean,"last_notified_at"?: string | null,"last_notified_cents"?: number | null,"product_id": string,"status"?: Database["public"]['Enums']["alert_status"],"target_cents": number,"updated_at"?: string,"user_id": string,"variant_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"include_new"?: boolean,"include_used"?: boolean,"last_notified_at"?: string | null,"last_notified_cents"?: number | null,"product_id"?: string,"status"?: Database["public"]['Enums']["alert_status"],"target_cents"?: number,"updated_at"?: string,"user_id"?: string,"variant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "price_alerts_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "deal_feed"
      referencedColumns: ["product_id"]
    },{
      foreignKeyName: "price_alerts_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "price_alerts_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
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
      referencedRelation: "deal_feed"
      referencedColumns: ["offer_id"]
    },{
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
      referencedRelation: "deal_feed"
      referencedColumns: ["product_id"]
    },{
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
      referencedRelation: "deal_feed"
      referencedColumns: ["product_id"]
    },{
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
      referencedRelation: "deal_feed"
      referencedColumns: ["product_id"]
    },{
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
                    "appearance": string | null,"created_at": string,"daily_deal_cap": number | null,"home_label": string | null,"home_point": unknown,"quiet_enabled": boolean,"quiet_end": string,"quiet_start": string,"search_radius_m": number,"tz": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "appearance"?: string | null,"created_at"?: string,"daily_deal_cap"?: number | null,"home_label"?: string | null,"home_point"?: unknown,"quiet_enabled"?: boolean,"quiet_end"?: string,"quiet_start"?: string,"search_radius_m"?: number,"tz"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "appearance"?: string | null,"created_at"?: string,"daily_deal_cap"?: number | null,"home_label"?: string | null,"home_point"?: unknown,"quiet_enabled"?: boolean,"quiet_end"?: string,"quiet_start"?: string,"search_radius_m"?: number,"tz"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"prohibited_terms": {
                  Row: {
                    "created_at": string,"reason": string,"term": string
                  }
                  Insert: {
                    "created_at"?: string,"reason": string,"term": string
                  }
                  Update: {
                    "created_at"?: string,"reason"?: string,"term"?: string
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
      referencedRelation: "deal_feed"
      referencedColumns: ["product_id"]
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
      referencedRelation: "deal_feed"
      referencedColumns: ["promo_id"]
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
                    "brand_id": string | null,"code": string,"created_at": string,"created_by": string | null,"discount_type": Database["public"]['Enums']["discount_type"],"discount_value": number,"ends_at": string | null,"id": string,"is_exclusive": boolean,"min_purchase_cents": number,"retailer_id": string,"source_id": string | null,"starts_at": string | null,"status": Database["public"]['Enums']["promo_status"],"terms": string | null,"title": string,"updated_at": string,"verified_at": string | null,"verified_by": string | null,"promo_is_live": boolean | null
                  }
                  Insert: {
                    "brand_id"?: string | null,"code": string,"created_at"?: string,"created_by"?: string | null,"discount_type": Database["public"]['Enums']["discount_type"],"discount_value": number,"ends_at"?: string | null,"id"?: string,"is_exclusive"?: boolean,"min_purchase_cents"?: number,"retailer_id": string,"source_id"?: string | null,"starts_at"?: string | null,"status"?: Database["public"]['Enums']["promo_status"],"terms"?: string | null,"title": string,"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Update: {
                    "brand_id"?: string | null,"code"?: string,"created_at"?: string,"created_by"?: string | null,"discount_type"?: Database["public"]['Enums']["discount_type"],"discount_value"?: number,"ends_at"?: string | null,"id"?: string,"is_exclusive"?: boolean,"min_purchase_cents"?: number,"retailer_id"?: string,"source_id"?: string | null,"starts_at"?: string | null,"status"?: Database["public"]['Enums']["promo_status"],"terms"?: string | null,"title"?: string,"updated_at"?: string,"verified_at"?: string | null,"verified_by"?: string | null
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
                },"push_receipts": {
                  Row: {
                    "created_at": string,"expo_token": string,"ticket_id": string
                  }
                  Insert: {
                    "created_at"?: string,"expo_token": string,"ticket_id": string
                  }
                  Update: {
                    "created_at"?: string,"expo_token"?: string,"ticket_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"push_tokens": {
                  Row: {
                    "created_at": string,"device_id": string | null,"expo_token": string,"id": string,"last_seen_at": string,"platform": string,"revoked_at": string | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"device_id"?: string | null,"expo_token": string,"id"?: string,"last_seen_at"?: string,"platform": string,"revoked_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"device_id"?: string | null,"expo_token"?: string,"id"?: string,"last_seen_at"?: string,"platform"?: string,"revoked_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
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
                },"reports": {
                  Row: {
                    "created_at": string,"details": string | null,"id": string,"reason": string,"reporter_id": string | null,"resolution_note": string | null,"resolved_at": string | null,"resolved_by": string | null,"status": Database["public"]['Enums']["report_status"],"target_id": string,"target_type": string
                  }
                  Insert: {
                    "created_at"?: string,"details"?: string | null,"id"?: string,"reason": string,"reporter_id"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["report_status"],"target_id": string,"target_type": string
                  }
                  Update: {
                    "created_at"?: string,"details"?: string | null,"id"?: string,"reason"?: string,"reporter_id"?: string | null,"resolution_note"?: string | null,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["report_status"],"target_id"?: string,"target_type"?: string
                  }
                  Relationships: [
                    
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
                },"saved_deals": {
                  Row: {
                    "created_at": string,"deal_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"deal_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"deal_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_deals_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deal_feed"
      referencedColumns: ["deal_id"]
    },{
      foreignKeyName: "saved_deals_deal_id_fkey"
      columns: ["deal_id"]
isOneToOne: false
      referencedRelation: "deals"
      referencedColumns: ["id"]
    }
                  ]
                },"saved_listings": {
                  Row: {
                    "created_at": string,"listing_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"listing_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"listing_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_listings_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    }
                  ]
                },"saved_products": {
                  Row: {
                    "created_at": string,"product_id": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"product_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"product_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_products_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "deal_feed"
      referencedColumns: ["product_id"]
    },{
      foreignKeyName: "saved_products_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"saved_searches": {
                  Row: {
                    "brand_slug": string | null,"category_slug": string | null,"created_at": string,"filters": NonNullable<Json>,"id": string,"label": string,"max_cents": number | null,"notify": boolean,"query": string | null,"scope": string,"user_id": string
                  }
                  Insert: {
                    "brand_slug"?: string | null,"category_slug"?: string | null,"created_at"?: string,"filters"?: NonNullable<Json>,"id"?: string,"label": string,"max_cents"?: number | null,"notify"?: boolean,"query"?: string | null,"scope"?: string,"user_id": string
                  }
                  Update: {
                    "brand_slug"?: string | null,"category_slug"?: string | null,"created_at"?: string,"filters"?: NonNullable<Json>,"id"?: string,"label"?: string,"max_cents"?: number | null,"notify"?: boolean,"query"?: string | null,"scope"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"staff_actions": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"data": NonNullable<Json>,"id": number,"note": string | null,"target_id": string,"target_type": string
                  }
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: never,"note"?: string | null,"target_id": string,"target_type": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"data"?: NonNullable<Json>,"id"?: never,"note"?: string | null,"target_id"?: string,"target_type"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_blocks": {
                  Row: {
                    "blocked_id": string,"blocker_id": string,"created_at": string
                  }
                  Insert: {
                    "blocked_id": string,"blocker_id": string,"created_at"?: string
                  }
                  Update: {
                    "blocked_id"?: string,"blocker_id"?: string,"created_at"?: string
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
                },"user_suspensions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"hidden_listing_ids": (string)[],"id": string,"lifted_at": string | null,"lifted_by": string | null,"reason": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"hidden_listing_ids"?: (string)[],"id"?: string,"lifted_at"?: string | null,"lifted_by"?: string | null,"reason": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"hidden_listing_ids"?: (string)[],"id"?: string,"lifted_at"?: string | null,"lifted_by"?: string | null,"reason"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"variant_market_stats": {
                  Row: {
                    "active_listings": number,"min_ask_cents": number | null,"updated_at": string,"used_p25_cents": number | null,"used_p75_cents": number | null,"variant_id": string
                  }
                  Insert: {
                    "active_listings"?: number,"min_ask_cents"?: number | null,"updated_at"?: string,"used_p25_cents"?: number | null,"used_p75_cents"?: number | null,"variant_id": string
                  }
                  Update: {
                    "active_listings"?: number,"min_ask_cents"?: number | null,"updated_at"?: string,"used_p25_cents"?: number | null,"used_p75_cents"?: number | null,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "variant_market_stats_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: true
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    }
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
                },"deal_feed": {
                  Row: {
                    "badges": (string)[] | null,"brand_name": string | null,"brand_slug": string | null,"category_name": string | null,"category_slug": string | null,"created_at": string | null,"deal_id": string | null,"deal_quality": Database["public"]['Enums']["deal_quality"] | null,"discount_pct": number | null,"drop_7d_cents": number | null,"ends_at": string | null,"has_variants": boolean | null,"headline": string | null,"image": Json | null,"in_stock": boolean | null,"is_staff_pick": boolean | null,"kind": Database["public"]['Enums']["deal_kind"] | null,"msrp_cents": number | null,"offer_count": number | null,"offer_id": string | null,"origin": Database["public"]['Enums']["deal_origin"] | null,"price_cents": number | null,"price_display": Database["public"]['Enums']["price_display"] | null,"product_id": string | null,"product_name": string | null,"product_slug": string | null,"promo_code": string | null,"promo_id": string | null,"retailer_name": string | null,"retailer_slug": string | null,"score": number | null,"starts_at": string | null,"variant_id": string | null,"variant_label": string | null,"was_cents": number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "deals_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
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
      referencedRelation: "deal_feed"
      referencedColumns: ["product_id"]
    },{
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
            "accept_offer":
{ Args: { "offer": string }; Returns: string
                           },
"apply_raw_offer":
{ Args: { "raw_id": string,"vid": string }; Returns: Json
                           },
"badge_count":
{ Args: { "uid": string }; Returns: number
                           },
"block_user":
{ Args: { "target": string }; Returns: undefined
                           },
"can_use_topic":
{ Args: { "topic": string }; Returns: boolean
                           },
"check_listing_text":
{ Args: { "body": string,"title": string }; Returns: undefined
                           },
"claim_pending_notifications":
{ Args: { "at"?: string,"max_rows"?: number }; Returns: {
              "badge": number,"body": string,"id": string,"route": string,"title": string,"user_id": string
            }[]
                           },
"counter_offer":
{ Args: { "amount_cents": number,"message"?: string,"offer": string }; Returns: string
                           },
"custom_access_token_hook":
{ Args: { "event": Json }; Returns: Json
                           },
"deals_feed":
{ Args: { "brand_slug"?: string,"brand_slugs"?: (string)[],"category_slug"?: string,"collection_slug"?: string,"feed"?: string,"in_stock_only"?: boolean,"kinds"?: (string)[],"max_cents"?: number,"max_rows"?: number,"min_cents"?: number,"skip"?: number,"sort"?: string }; Returns: Json
                           },
"deals_home":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"decline_offer":
{ Args: { "offer": string }; Returns: undefined
                           },
"detect_deal":
{ Args: { "vid": string }; Returns: undefined
                           },
"evaluate_price_alerts":
{ Args: { "vid": string }; Returns: number
                           },
"expire_offers":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"file_report":
{ Args: { "details"?: string,"reason": string,"target_id": string,"target_type": string }; Returns: string
                           },
"first_name":
{ Args: { "uid": string }; Returns: string
                           },
"fmt_usd":
{ Args: { "cents": number }; Returns: string
                           },
"format_usd":
{ Args: { "cents": number }; Returns: string
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
"is_blocked_between":
{ Args: { "a": string,"b": string }; Returns: boolean
                           },
"is_participant":
{ Args: { "conversation": string }; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_suspended":
{ Args: { "uid": string }; Returns: boolean
                           },
"listing_is_public":
{ Args: { "lid": string }; Returns: boolean
                           },
"listing_label":
{ Args: { "lid": string }; Returns: string
                           },
"log_staff_action":
{ Args: { "action": string,"data"?: Json,"note"?: string,"target_id": string,"target_type": string }; Returns: undefined
                           },
"make_offer":
{ Args: { "amount_cents": number,"listing": string,"message"?: string }; Returns: Json
                           },
"mark_conversation_read":
{ Args: { "conversation": string,"up_to": number }; Returns: undefined
                           },
"mark_notifications_read":
{ Args: { "ids"?: (string)[] }; Returns: number
                           },
"market_feed":
{ Args: { "brand_slugs"?: (string)[],"category_slug"?: string,"conditions"?: (string)[],"ids"?: (string)[],"include_shipping"?: boolean,"lat"?: number,"lng"?: number,"max_cents"?: number,"max_rows"?: number,"min_cents"?: number,"pickup_only"?: boolean,"product"?: string,"q"?: string,"radius_m"?: number,"seller"?: string,"skip"?: number,"sort"?: string,"statuses"?: (string)[],"use_home"?: boolean }; Returns: Json
                           },
"market_in_bounds":
{ Args: { "brand_slugs"?: (string)[],"category_slug"?: string,"conditions"?: (string)[],"lat"?: number,"lng"?: number,"max_cents"?: number,"max_lat": number,"max_lng": number,"max_rows"?: number,"min_cents"?: number,"min_lat": number,"min_lng": number,"pickup_only"?: boolean,"q"?: string,"statuses"?: (string)[],"use_home"?: boolean }; Returns: Json
                           },
"market_match":
{ Args: { "brand_slugs"?: (string)[],"category_slug"?: string,"conditions"?: (string)[],"ids"?: (string)[],"max_cents"?: number,"min_cents"?: number,"pickup_only"?: boolean,"product"?: string,"q"?: string,"seller"?: string,"statuses"?: (string)[] }; Returns: string[]
                           },
"my_badge_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"my_conversations":
{ Args: { "only_id"?: string }; Returns: {
              "accepts_offers": boolean,"archived": boolean,"category_slug": string,"id": string,"last_message_at": string,"last_message_id": number,"last_message_mine": boolean,"last_message_preview": string,"listing_id": string,"listing_image": string,"listing_price_cents": number,"listing_status": string,"listing_title": string,"muted": boolean,"offer_amount_cents": number,"offer_awaiting_me": boolean,"offer_id": string,"offer_mine": boolean,"offer_status": string,"other_id": string,"other_last_read_at": string,"other_last_read_message_id": number,"other_name": string,"product_slug": string,"role": string,"unread": number,"variant_id": string
            }[]
                           },
"my_listing_activity":
{ Args: Record<PropertyKey, never>; Returns: {
              "chats": number,"listing_id": string,"open_offers": number
            }[]
                           },
"my_listing_save_counts":
{ Args: Record<PropertyKey, never>; Returns: {
              "listing_id": string,"saves": number
            }[]
                           },
"my_notification_settings":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_offers":
{ Args: Record<PropertyKey, never>; Returns: {
              "amount_cents": number,"awaiting_me": boolean,"category_slug": string,"conversation_id": string,"created_at": string,"expires_at": string,"id": string,"listing_id": string,"listing_image": string,"listing_title": string,"mine": boolean,"other_name": string,"product_slug": string,"role": string,"status": string
            }[]
                           },
"notification_pref":
{ Args: { "category": string,"uid": string }; Returns: {
              "in_app": boolean,"push": boolean
            }[]
                           },
"notify":
{ Args: { "body": string,"dedupe": string,"extra"?: Json,"kind": string,"route": string,"title": string,"uid": string }; Returns: undefined
                           },
"offer_event":
{ Args: { "action": string,"actor": string,"body": string,"extra"?: Json,"o": Database["public"]['Tables']["marketplace_offers"]['Row'] }; Returns: undefined
                           },
"offer_for_action":
{ Args: { "as_role": string,"offer": string }; Returns: {
              "amount_cents": number,
"auto_declined": boolean,
"buyer_id": string | null,
"conversation_id": string,
"created_at": string,
"expires_at": string,
"id": string,
"listing_id": string,
"message": string | null,
"parent_offer_id": string | null,
"proposed_by": string | null,
"reminded_at": string | null,
"responded_at": string | null,
"seller_id": string | null,
"status": Database["public"]['Enums']["marketplace_offer_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "marketplace_offers"
        isOneToOne: true
        isSetofReturn: false
      } },
"offer_notify":
{ Args: { "body": string,"o": Database["public"]['Tables']["marketplace_offers"]['Row'],"recipient": string,"title": string }; Returns: undefined
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
"promote_listing_review":
{ Args: { "brand": string,"name": string,"review": string,"variant_label"?: string }; Returns: string
                           },
"publish_listing":
{ Args: { "listing": Json }; Returns: string
                           },
"quiet_window":
{ Args: { "at"?: string,"uid": string }; Returns: {
              "ends_at": string,"quiet": boolean
            }[]
                           },
"recent_price_changes":
{ Args: { "max_rows"?: number,"variant": string }; Returns: {
              "observed_at": string,"previous_cents": number,"price_cents": number,"retailer_name": string
            }[]
                           },
"refresh_deals":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"refresh_variant_market_stats":
{ Args: { "vid": string }; Returns: undefined
                           },
"refresh_variant_price_stats":
{ Args: { "vid": string }; Returns: undefined
                           },
"register_push_token":
{ Args: { "device"?: string,"platform": string,"token": string }; Returns: undefined
                           },
"reject_raw_offer":
{ Args: { "raw_id": string }; Returns: undefined
                           },
"release_held_notifications":
{ Args: { "at"?: string }; Returns: number
                           },
"reopen_raw_offer":
{ Args: { "raw_id": string }; Returns: undefined
                           },
"resolve_listing_review":
{ Args: { "decision": string,"notes"?: string,"review": string,"variant"?: string }; Returns: undefined
                           },
"resolve_raw_offer":
{ Args: { "raw_id": string,"remember"?: boolean,"variant": string }; Returns: Json
                           },
"resolve_report":
{ Args: { "decision": string,"note"?: string,"remove_listing"?: boolean,"report": string }; Returns: undefined
                           },
"restore_listing":
{ Args: { "lid": string,"tell_seller"?: boolean }; Returns: boolean
                           },
"search_catalog":
{ Args: { "product_limit"?: number,"q": string }; Returns: Json
                           },
"send_weekly_digests":
{ Args: { "at"?: string }; Returns: number
                           },
"set_conversation_state":
{ Args: { "archived"?: boolean,"conversation": string,"muted"?: boolean }; Returns: undefined
                           },
"set_home_area":
{ Args: { "label": string,"lat": number,"lng": number,"radius_m"?: number }; Returns: undefined
                           },
"set_listing_location":
{ Args: { "area_label": string,"lat": number,"listing": string,"lng": number,"postal_code"?: string }; Returns: undefined
                           },
"set_listing_status":
{ Args: { "buyer"?: string,"listing": string,"sold_price"?: number,"status": string }; Returns: undefined
                           },
"set_notification_preference":
{ Args: { "category": string,"enabled": boolean }; Returns: undefined
                           },
"set_notification_settings":
{ Args: { "clear_cap"?: boolean,"daily_deal_cap"?: number,"quiet_enabled"?: boolean,"quiet_end"?: string,"quiet_start"?: string,"tz"?: string }; Returns: undefined
                           },
"set_viewing":
{ Args: { "conversation": string,"viewing"?: boolean }; Returns: undefined
                           },
"snap_point":
{ Args: { "cell_precision"?: number,"lat": number,"lng": number }; Returns: {
              "geohash": string,"point": unknown
            }[]
                           },
"staff_activity":
{ Args: { "for_id"?: string,"for_type"?: string,"max_rows"?: number }; Returns: {
              "action": string,"actor_name": string,"created_at": string,"data": Json,"id": number,"note": string,"target_id": string,"target_type": string
            }[]
                           },
"staff_listings":
{ Args: { "by_seller"?: string,"max_rows"?: number,"q"?: string,"skip"?: number,"with_status"?: string }; Returns: {
              "area_label": string,"condition": string,"created_at": string,"id": string,"image_path": string,"open_reports": number,"price_cents": number,"published_at": string,"removed_at": string,"removed_by_staff": boolean,"removed_reason": string,"seller_id": string,"seller_name": string,"seller_suspended": boolean,"status": string,"title": string,"total": number,"total_reports": number
            }[]
                           },
"staff_metrics":
{ Args: { "days"?: number }; Returns: Json
                           },
"staff_queue_counts":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"staff_reports":
{ Args: { "include_closed"?: boolean }; Returns: {
              "created_at": string,"details": string,"id": string,"listing_status": string,"open_reports": number,"reason": string,"reporter_name": string,"status": string,"target_id": string,"target_label": string,"target_owner": string,"target_owner_name": string,"target_type": string,"transcript": Json
            }[]
                           },
"staff_set_listing_status":
{ Args: { "action": string,"listing": string,"reason"?: string }; Returns: undefined
                           },
"staff_suspend_user":
{ Args: { "hide_listings"?: boolean,"reason": string,"target": string }; Returns: number
                           },
"staff_unsuspend_user":
{ Args: { "restore_listings"?: boolean,"target": string }; Returns: number
                           },
"staff_users":
{ Args: { "max_rows"?: number,"only_suspended"?: boolean,"q"?: string,"skip"?: number }; Returns: {
              "active_listings": number,"blocked_by": number,"display_name": string,"email": string,"filed_reports": number,"id": string,"joined_at": string,"last_sign_in_at": string,"open_reports": number,"role": string,"suspended": boolean,"suspended_at": string,"suspension_reason": string,"total": number,"total_listings": number
            }[]
                           },
"start_conversation":
{ Args: { "listing": string }; Returns: string
                           },
"suggest_catalog_matches":
{ Args: { "brand"?: string,"max_rows"?: number,"title": string }; Returns: Json
                           },
"takedown_listing":
{ Args: { "lid": string,"reason": string,"tell_seller"?: boolean }; Returns: boolean
                           },
"trigger_dispatch":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"try_uuid":
{ Args: { "v": string }; Returns: string
                           },
"unblock_user":
{ Args: { "target": string }; Returns: undefined
                           },
"unread_conversation_count":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"update_listing":
{ Args: { "changes": Json,"listing": string }; Returns: undefined
                           },
"variant_daily_lows":
{ Args: { "days": number,"retailer"?: string,"vid": string }; Returns: {
              "day": string,"low_cents": number
            }[]
                           },
"variant_low_on":
{ Args: { "d": string,"vid": string }; Returns: number
                           },
"withdraw_offer":
{ Args: { "offer": string }; Returns: undefined
                           }
          }
          Enums: {
            "alert_status": "active"|"paused","app_role": "admin"|"editor","catalog_review_decision": "pending"|"linked"|"promoted"|"dismissed","collection_kind": "editorial"|"sponsored","deal_kind": "price_drop"|"sale"|"promo"|"editorial","deal_origin": "auto"|"curated","deal_quality": "above_typical"|"typical"|"good"|"excellent"|"all_time_low","deal_status": "active"|"expired"|"removed","discount_type": "percent"|"amount"|"free_ship","display_name_source": "generated"|"provided","identifier_kind": "gtin"|"upc"|"ean"|"asin"|"mpn"|"retailer_sku","image_source": "brand_supplied"|"manufacturer_site"|"retailer_feed"|"affiliate_feed"|"owned","image_status": "active"|"pending_review"|"removed","ingestion_kind": "manual"|"csv"|"feed"|"api","listing_condition": "new_sealed"|"like_new"|"excellent"|"good"|"fair","listing_status": "draft"|"active"|"pending"|"sold"|"removed","marketplace_offer_status": "pending"|"accepted"|"declined"|"countered"|"withdrawn"|"expired","match_status": "matched"|"unmatched"|"rejected","message_kind": "text"|"image"|"offer_event"|"status_event"|"location_share","offer_status": "active"|"inactive","placement_kind": "sponsored_deal"|"sponsored_product"|"sponsored_collection","price_display": "show"|"check_price","price_source": "manual"|"feed"|"api","product_status": "draft"|"active"|"discontinued","promo_status": "active"|"removed","push_status": "pending"|"sending"|"sent"|"skipped"|"failed","report_status": "open"|"actioned"|"dismissed","retailer_kind": "marketplace"|"retailer"|"manufacturer"
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
            "alert_status": ["active", "paused"],"app_role": ["admin", "editor"],"catalog_review_decision": ["pending", "linked", "promoted", "dismissed"],"collection_kind": ["editorial", "sponsored"],"deal_kind": ["price_drop", "sale", "promo", "editorial"],"deal_origin": ["auto", "curated"],"deal_quality": ["above_typical", "typical", "good", "excellent", "all_time_low"],"deal_status": ["active", "expired", "removed"],"discount_type": ["percent", "amount", "free_ship"],"display_name_source": ["generated", "provided"],"identifier_kind": ["gtin", "upc", "ean", "asin", "mpn", "retailer_sku"],"image_source": ["brand_supplied", "manufacturer_site", "retailer_feed", "affiliate_feed", "owned"],"image_status": ["active", "pending_review", "removed"],"ingestion_kind": ["manual", "csv", "feed", "api"],"listing_condition": ["new_sealed", "like_new", "excellent", "good", "fair"],"listing_status": ["draft", "active", "pending", "sold", "removed"],"marketplace_offer_status": ["pending", "accepted", "declined", "countered", "withdrawn", "expired"],"match_status": ["matched", "unmatched", "rejected"],"message_kind": ["text", "image", "offer_event", "status_event", "location_share"],"offer_status": ["active", "inactive"],"placement_kind": ["sponsored_deal", "sponsored_product", "sponsored_collection"],"price_display": ["show", "check_price"],"price_source": ["manual", "feed", "api"],"product_status": ["draft", "active", "discontinued"],"promo_status": ["active", "removed"],"push_status": ["pending", "sending", "sent", "skipped", "failed"],"report_status": ["open", "actioned", "dismissed"],"retailer_kind": ["marketplace", "retailer", "manufacturer"]
          }
        }
} as const
