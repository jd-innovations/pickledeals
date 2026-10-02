
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
            "brands": {
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
                }
          }
          Functions: {
            "custom_access_token_hook":
{ Args: { "event": Json }; Returns: Json
                           },
"import_catalog":
{ Args: { "dry_run"?: boolean,"payload": Json }; Returns: Json
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"product_is_public":
{ Args: { "pid": string }; Returns: boolean
                           },
"search_catalog":
{ Args: { "product_limit"?: number,"q": string }; Returns: Json
                           }
          }
          Enums: {
            "app_role": "admin"|"editor","display_name_source": "generated"|"provided","identifier_kind": "gtin"|"upc"|"ean"|"asin"|"mpn"|"retailer_sku","image_source": "brand_supplied"|"manufacturer_site"|"retailer_feed"|"affiliate_feed"|"owned","image_status": "active"|"pending_review"|"removed","product_status": "draft"|"active"|"discontinued"
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
            "app_role": ["admin", "editor"],"display_name_source": ["generated", "provided"],"identifier_kind": ["gtin", "upc", "ean", "asin", "mpn", "retailer_sku"],"image_source": ["brand_supplied", "manufacturer_site", "retailer_feed", "affiliate_feed", "owned"],"image_status": ["active", "pending_review", "removed"],"product_status": ["draft", "active", "discontinued"]
          }
        }
} as const
