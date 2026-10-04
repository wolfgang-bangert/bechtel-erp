export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      abrechnung: {
        Row: {
          bis: string
          created_at: string
          festgeschrieben_at: string | null
          id: string
          invoice_id: string | null
          jahr: number
          kw: number
          notiz: string | null
          status: string
          summe_netto: number
          updated_at: string
          von: string
        }
        Insert: {
          bis: string
          created_at?: string
          festgeschrieben_at?: string | null
          id?: string
          invoice_id?: string | null
          jahr: number
          kw: number
          notiz?: string | null
          status?: string
          summe_netto?: number
          updated_at?: string
          von: string
        }
        Update: {
          bis?: string
          created_at?: string
          festgeschrieben_at?: string | null
          id?: string
          invoice_id?: string | null
          jahr?: number
          kw?: number
          notiz?: string | null
          status?: string
          summe_netto?: number
          updated_at?: string
          von?: string
        }
        Relationships: [
          {
            foreignKeyName: "abrechnung_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
        ]
      }
      abrechnung_position: {
        Row: {
          abrechnung_id: string
          auflage: number | null
          betrag_netto: number
          bezeichnung: string | null
          blatt: number | null
          created_at: string
          format: string | null
          id: string
          ist_rekla: boolean
          kategorie: string | null
          manuell: boolean
          notiz: string | null
          portal_order_id: string | null
          preis_netto: number | null
          referenz: string | null
          rekla_vermerk: string | null
          updated_at: string
        }
        Insert: {
          abrechnung_id: string
          auflage?: number | null
          betrag_netto?: number
          bezeichnung?: string | null
          blatt?: number | null
          created_at?: string
          format?: string | null
          id?: string
          ist_rekla?: boolean
          kategorie?: string | null
          manuell?: boolean
          notiz?: string | null
          portal_order_id?: string | null
          preis_netto?: number | null
          referenz?: string | null
          rekla_vermerk?: string | null
          updated_at?: string
        }
        Update: {
          abrechnung_id?: string
          auflage?: number | null
          betrag_netto?: number
          bezeichnung?: string | null
          blatt?: number | null
          created_at?: string
          format?: string | null
          id?: string
          ist_rekla?: boolean
          kategorie?: string | null
          manuell?: boolean
          notiz?: string | null
          portal_order_id?: string | null
          preis_netto?: number | null
          referenz?: string | null
          rekla_vermerk?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "abrechnung_position_abrechnung_id_fkey"
            columns: ["abrechnung_id"]
            isOneToOne: false
            referencedRelation: "abrechnung"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abrechnung_position_portal_order_id_fkey"
            columns: ["portal_order_id"]
            isOneToOne: false
            referencedRelation: "portal_order"
            referencedColumns: ["id"]
          },
        ]
      }
      address: {
        Row: {
          address_addition: string | null
          city: string | null
          country: string
          created_at: string
          external_id: string | null
          house_number: string | null
          id: string
          is_default: boolean
          kind: Database["public"]["Enums"]["address_kind"]
          line1: string
          line2: string | null
          organization_id: string
          source: string
          street: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          address_addition?: string | null
          city?: string | null
          country?: string
          created_at?: string
          external_id?: string | null
          house_number?: string | null
          id?: string
          is_default?: boolean
          kind?: Database["public"]["Enums"]["address_kind"]
          line1: string
          line2?: string | null
          organization_id: string
          source?: string
          street?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address_addition?: string | null
          city?: string | null
          country?: string
          created_at?: string
          external_id?: string | null
          house_number?: string | null
          id?: string
          is_default?: boolean
          kind?: Database["public"]["Enums"]["address_kind"]
          line1?: string
          line2?: string | null
          organization_id?: string
          source?: string
          street?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "address_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      app_user: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["app_user_kind"]
          last_login_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["app_user_kind"]
          last_login_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["app_user_kind"]
          last_login_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          changed_at: string
          context: Json | null
          id: number
          row_id: string
          table_name: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          changed_at?: string
          context?: Json | null
          id?: never
          row_id: string
          table_name: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          changed_at?: string
          context?: Json | null
          id?: never
          row_id?: string
          table_name?: string
        }
        Relationships: []
      }
      bank_account: {
        Row: {
          balance: number | null
          balance_at: string | null
          balance_date: string | null
          bank_name: string | null
          created_at: string
          gocardless_account_id: string | null
          iban: string
          id: string
          is_active: boolean
          kind: string
          label: string
          ledger_account: string | null
          updated_at: string
        }
        Insert: {
          balance?: number | null
          balance_at?: string | null
          balance_date?: string | null
          bank_name?: string | null
          created_at?: string
          gocardless_account_id?: string | null
          iban: string
          id?: string
          is_active?: boolean
          kind?: string
          label: string
          ledger_account?: string | null
          updated_at?: string
        }
        Update: {
          balance?: number | null
          balance_at?: string | null
          balance_date?: string | null
          bank_name?: string | null
          created_at?: string
          gocardless_account_id?: string | null
          iban?: string
          id?: string
          is_active?: boolean
          kind?: string
          label?: string
          ledger_account?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bank_ledger_rule: {
        Row: {
          confidence: number | null
          counterparty_key: string
          counterparty_name: string
          created_at: string
          id: string
          is_active: boolean
          ledger_account: string
          sample_count: number
          sample_postingtext: string | null
          source: string
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          counterparty_key: string
          counterparty_name: string
          created_at?: string
          id?: string
          is_active?: boolean
          ledger_account: string
          sample_count?: number
          sample_postingtext?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          counterparty_key?: string
          counterparty_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
          ledger_account?: string
          sample_count?: number
          sample_postingtext?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      bank_transaction: {
        Row: {
          amount: number
          bank_account_id: string
          bank_ref: string | null
          booking_date: string
          counterparty_iban: string | null
          counterparty_name: string | null
          created_at: string
          currency: string
          dedup_key: string
          end_to_end_id: string | null
          id: string
          import_batch: string | null
          match_status: string
          purpose: string | null
          raw: Json | null
          updated_at: string
          value_date: string | null
        }
        Insert: {
          amount: number
          bank_account_id: string
          bank_ref?: string | null
          booking_date: string
          counterparty_iban?: string | null
          counterparty_name?: string | null
          created_at?: string
          currency?: string
          dedup_key: string
          end_to_end_id?: string | null
          id?: string
          import_batch?: string | null
          match_status?: string
          purpose?: string | null
          raw?: Json | null
          updated_at?: string
          value_date?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string
          bank_ref?: string | null
          booking_date?: string
          counterparty_iban?: string | null
          counterparty_name?: string | null
          created_at?: string
          currency?: string
          dedup_key?: string
          end_to_end_id?: string | null
          id?: string
          import_batch?: string | null
          match_status?: string
          purpose?: string | null
          raw?: Json | null
          updated_at?: string
          value_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transaction_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_account"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transaction_match: {
        Row: {
          amount: number
          attachment_file_name: string | null
          attachment_storage_key: string | null
          auto: boolean
          bank_transaction_id: string
          created_at: string
          created_by: string | null
          id: string
          incoming_document_id: string | null
          kind: string | null
          ledger_account: string | null
          net_amount: number | null
          note: string | null
          payroll_booking_id: string | null
          sales_invoice_id: string | null
          tax_amount: number | null
          tax_rate: number | null
          updated_at: string
        }
        Insert: {
          amount: number
          attachment_file_name?: string | null
          attachment_storage_key?: string | null
          auto?: boolean
          bank_transaction_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          incoming_document_id?: string | null
          kind?: string | null
          ledger_account?: string | null
          net_amount?: number | null
          note?: string | null
          payroll_booking_id?: string | null
          sales_invoice_id?: string | null
          tax_amount?: number | null
          tax_rate?: number | null
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_file_name?: string | null
          attachment_storage_key?: string | null
          auto?: boolean
          bank_transaction_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          incoming_document_id?: string | null
          kind?: string | null
          ledger_account?: string | null
          net_amount?: number | null
          note?: string | null
          payroll_booking_id?: string | null
          sales_invoice_id?: string | null
          tax_amount?: number | null
          tax_rate?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transaction_match_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transaction"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transaction_match_incoming_document_id_fkey"
            columns: ["incoming_document_id"]
            isOneToOne: false
            referencedRelation: "incoming_document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transaction_match_payroll_booking_id_fkey"
            columns: ["payroll_booking_id"]
            isOneToOne: false
            referencedRelation: "payroll_booking"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transaction_match_sales_invoice_id_fkey"
            columns: ["sales_invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoice"
            referencedColumns: ["id"]
          },
        ]
      }
      batch: {
        Row: {
          an_flux_at: string | null
          cello: string
          cello_erledigt_at: string | null
          cello_seiten: number
          created_at: string
          dauer_minuten: number | null
          druckbogen: string | null
          druckverfahren: string | null
          flux_order_id: string | null
          flux_payload: Json | null
          flux_response: Json | null
          gedruckt_at: string | null
          id: string
          maschine_auto: boolean
          maschine_id: string | null
          notiz: string | null
          nummer: string
          papier: string | null
          plan_ende: string | null
          plan_reihenfolge: number | null
          plan_start: string | null
          printer_name: string | null
          schluessel: string
          status: string
          typ: string
          updated_at: string
        }
        Insert: {
          an_flux_at?: string | null
          cello?: string
          cello_erledigt_at?: string | null
          cello_seiten?: number
          created_at?: string
          dauer_minuten?: number | null
          druckbogen?: string | null
          druckverfahren?: string | null
          flux_order_id?: string | null
          flux_payload?: Json | null
          flux_response?: Json | null
          gedruckt_at?: string | null
          id?: string
          maschine_auto?: boolean
          maschine_id?: string | null
          notiz?: string | null
          nummer: string
          papier?: string | null
          plan_ende?: string | null
          plan_reihenfolge?: number | null
          plan_start?: string | null
          printer_name?: string | null
          schluessel: string
          status?: string
          typ?: string
          updated_at?: string
        }
        Update: {
          an_flux_at?: string | null
          cello?: string
          cello_erledigt_at?: string | null
          cello_seiten?: number
          created_at?: string
          dauer_minuten?: number | null
          druckbogen?: string | null
          druckverfahren?: string | null
          flux_order_id?: string | null
          flux_payload?: Json | null
          flux_response?: Json | null
          gedruckt_at?: string | null
          id?: string
          maschine_auto?: boolean
          maschine_id?: string | null
          notiz?: string | null
          nummer?: string
          papier?: string | null
          plan_ende?: string | null
          plan_reihenfolge?: number | null
          plan_start?: string | null
          printer_name?: string | null
          schluessel?: string
          status?: string
          typ?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_maschine_id_fkey"
            columns: ["maschine_id"]
            isOneToOne: false
            referencedRelation: "maschine"
            referencedColumns: ["id"]
          },
        ]
      }
      carrier: {
        Row: {
          api_enabled: boolean
          art: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          notiz: string | null
          updated_at: string
        }
        Insert: {
          api_enabled?: boolean
          art?: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notiz?: string | null
          updated_at?: string
        }
        Update: {
          api_enabled?: boolean
          art?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notiz?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      carrier_rate: {
        Row: {
          carrier_id: string
          created_at: string
          gilt_ab: string | null
          gilt_bis: string | null
          id: string
          kg_bis: number
          kg_von: number
          notiz: string | null
          preis: number
          produkt: string | null
          updated_at: string
          zone: number | null
        }
        Insert: {
          carrier_id: string
          created_at?: string
          gilt_ab?: string | null
          gilt_bis?: string | null
          id?: string
          kg_bis: number
          kg_von?: number
          notiz?: string | null
          preis: number
          produkt?: string | null
          updated_at?: string
          zone?: number | null
        }
        Update: {
          carrier_id?: string
          created_at?: string
          gilt_ab?: string | null
          gilt_bis?: string | null
          id?: string
          kg_bis?: number
          kg_von?: number
          notiz?: string | null
          preis?: number
          produkt?: string | null
          updated_at?: string
          zone?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "carrier_rate_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carrier"
            referencedColumns: ["id"]
          },
        ]
      }
      carrier_zone: {
        Row: {
          carrier_id: string
          id: string
          land: string
          plz_prefix: string
          zone: number
        }
        Insert: {
          carrier_id: string
          id?: string
          land?: string
          plz_prefix: string
          zone: number
        }
        Update: {
          carrier_id?: string
          id?: string
          land?: string
          plz_prefix?: string
          zone?: number
        }
        Relationships: [
          {
            foreignKeyName: "carrier_zone_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carrier"
            referencedColumns: ["id"]
          },
        ]
      }
      contact: {
        Row: {
          app_user_id: string | null
          created_at: string
          email: string | null
          external_id: string | null
          first_name: string
          id: string
          is_primary: boolean
          keyline_id: string | null
          last_name: string
          organization_id: string
          phone: string | null
          position: string | null
          source: string
          updated_at: string
        }
        Insert: {
          app_user_id?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          first_name: string
          id?: string
          is_primary?: boolean
          keyline_id?: string | null
          last_name: string
          organization_id: string
          phone?: string | null
          position?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          app_user_id?: string | null
          created_at?: string
          email?: string | null
          external_id?: string | null
          first_name?: string
          id?: string
          is_primary?: boolean
          keyline_id?: string | null
          last_name?: string
          organization_id?: string
          phone?: string | null
          position?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_app_user_id_fkey"
            columns: ["app_user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_center: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          number: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          number?: string
          updated_at?: string
        }
        Relationships: []
      }
      datev_export: {
        Row: {
          created_at: string
          created_by: string | null
          file_bytes: number | null
          file_name: string
          file_sha256: string
          format: string
          gross_total: number | null
          id: string
          kind: string
          period_end: string
          period_start: string
          row_count: number
          scope: string
          skipped_count: number
          storage_key: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_bytes?: number | null
          file_name: string
          file_sha256: string
          format?: string
          gross_total?: number | null
          id?: string
          kind?: string
          period_end: string
          period_start: string
          row_count?: number
          scope?: string
          skipped_count?: number
          storage_key?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_bytes?: number | null
          file_name?: string
          file_sha256?: string
          format?: string
          gross_total?: number | null
          id?: string
          kind?: string
          period_end?: string
          period_start?: string
          row_count?: number
          scope?: string
          skipped_count?: number
          storage_key?: string | null
        }
        Relationships: []
      }
      datev_export_line: {
        Row: {
          datev_export_id: string
          id: string
          source_id: string
          source_table: string
        }
        Insert: {
          datev_export_id: string
          id?: string
          source_id: string
          source_table: string
        }
        Update: {
          datev_export_id?: string
          id?: string
          source_id?: string
          source_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "datev_export_line_datev_export_id_fkey"
            columns: ["datev_export_id"]
            isOneToOne: false
            referencedRelation: "datev_export"
            referencedColumns: ["id"]
          },
        ]
      }
      datev_settings: {
        Row: {
          berater_nr: string | null
          fiscal_year_start: string
          id: number
          mandanten_nr: string | null
          personenkonto_length: number
          sachkonto_length: number
          skr: string
          updated_at: string
        }
        Insert: {
          berater_nr?: string | null
          fiscal_year_start?: string
          id?: number
          mandanten_nr?: string | null
          personenkonto_length?: number
          sachkonto_length?: number
          skr?: string
          updated_at?: string
        }
        Update: {
          berater_nr?: string | null
          fiscal_year_start?: string
          id?: number
          mandanten_nr?: string | null
          personenkonto_length?: number
          sachkonto_length?: number
          skr?: string
          updated_at?: string
        }
        Relationships: []
      }
      druckbogen: {
        Row: {
          breite_mm: number
          code: string
          created_at: string
          greifer_mm: number
          hoehe_mm: number
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          notiz: string | null
          updated_at: string
        }
        Insert: {
          breite_mm: number
          code: string
          created_at?: string
          greifer_mm?: number
          hoehe_mm: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          notiz?: string | null
          updated_at?: string
        }
        Update: {
          breite_mm?: number
          code?: string
          created_at?: string
          greifer_mm?: number
          hoehe_mm?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          notiz?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      employee: {
        Row: {
          app_user_id: string | null
          cost_center_id: string | null
          created_at: string
          first_name: string
          hire_date: string | null
          id: string
          is_active: boolean
          last_name: string
          leave_date: string | null
          personnel_number: string
          updated_at: string
          vacation_entitlement_days: number
          weekly_hours: number
          working_time_model_id: string | null
        }
        Insert: {
          app_user_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          first_name: string
          hire_date?: string | null
          id?: string
          is_active?: boolean
          last_name: string
          leave_date?: string | null
          personnel_number: string
          updated_at?: string
          vacation_entitlement_days?: number
          weekly_hours?: number
          working_time_model_id?: string | null
        }
        Update: {
          app_user_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          first_name?: string
          hire_date?: string | null
          id?: string
          is_active?: boolean
          last_name?: string
          leave_date?: string | null
          personnel_number?: string
          updated_at?: string
          vacation_entitlement_days?: number
          weekly_hours?: number
          working_time_model_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_app_user_id_fkey"
            columns: ["app_user_id"]
            isOneToOne: true
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_center"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_working_time_model_id_fkey"
            columns: ["working_time_model_id"]
            isOneToOne: false
            referencedRelation: "working_time_model"
            referencedColumns: ["id"]
          },
        ]
      }
      external_sync_state: {
        Row: {
          error: string | null
          last_cursor: string | null
          last_run_at: string | null
          last_status: string | null
          resource: string
          system: string
          updated_at: string
        }
        Insert: {
          error?: string | null
          last_cursor?: string | null
          last_run_at?: string | null
          last_status?: string | null
          resource: string
          system: string
          updated_at?: string
        }
        Update: {
          error?: string | null
          last_cursor?: string | null
          last_run_at?: string | null
          last_status?: string | null
          resource?: string
          system?: string
          updated_at?: string
        }
        Relationships: []
      }
      faehigkeit: {
        Row: {
          art: string
          created_at: string
          einheit: string | null
          key: string
          label: string
          notiz: string | null
          optionen: string[]
          sortierung: number
          taetigkeit: string
          updated_at: string
        }
        Insert: {
          art: string
          created_at?: string
          einheit?: string | null
          key: string
          label: string
          notiz?: string | null
          optionen?: string[]
          sortierung?: number
          taetigkeit?: string
          updated_at?: string
        }
        Update: {
          art?: string
          created_at?: string
          einheit?: string | null
          key?: string
          label?: string
          notiz?: string | null
          optionen?: string[]
          sortierung?: number
          taetigkeit?: string
          updated_at?: string
        }
        Relationships: []
      }
      file: {
        Row: {
          created_at: string
          filename: string
          id: string
          kind: string
          mime: string | null
          organization_id: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          filename: string
          id?: string
          kind: string
          mime?: string | null
          organization_id?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          filename?: string
          id?: string
          kind?: string
          mime?: string | null
          organization_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      flux_status_log: {
        Row: {
          event: string | null
          flux_order_id: string | null
          flux_order_item_id: string | null
          id: string
          job_id: string | null
          matched: boolean
          message: string | null
          portal_order_id: string | null
          raw: Json
          received_at: string
          signature_ok: boolean | null
          status: string | null
          work_step: string | null
        }
        Insert: {
          event?: string | null
          flux_order_id?: string | null
          flux_order_item_id?: string | null
          id?: string
          job_id?: string | null
          matched?: boolean
          message?: string | null
          portal_order_id?: string | null
          raw?: Json
          received_at?: string
          signature_ok?: boolean | null
          status?: string | null
          work_step?: string | null
        }
        Update: {
          event?: string | null
          flux_order_id?: string | null
          flux_order_item_id?: string | null
          id?: string
          job_id?: string | null
          matched?: boolean
          message?: string | null
          portal_order_id?: string | null
          raw?: Json
          received_at?: string
          signature_ok?: boolean | null
          status?: string | null
          work_step?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flux_status_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flux_status_log_portal_order_id_fkey"
            columns: ["portal_order_id"]
            isOneToOne: false
            referencedRelation: "portal_order"
            referencedColumns: ["id"]
          },
        ]
      }
      flux_webhook_event: {
        Row: {
          aktiv_in_flux: boolean
          created_at: string
          gruppe: string
          id: string
          key: string
          label: string
          notiz: string | null
          opri_bezug: boolean
          sortierung: number
          status_optionen: string[]
          updated_at: string
          verarbeitet_in_werk: string | null
        }
        Insert: {
          aktiv_in_flux?: boolean
          created_at?: string
          gruppe: string
          id?: string
          key: string
          label: string
          notiz?: string | null
          opri_bezug?: boolean
          sortierung?: number
          status_optionen?: string[]
          updated_at?: string
          verarbeitet_in_werk?: string | null
        }
        Update: {
          aktiv_in_flux?: boolean
          created_at?: string
          gruppe?: string
          id?: string
          key?: string
          label?: string
          notiz?: string | null
          opri_bezug?: boolean
          sortierung?: number
          status_optionen?: string[]
          updated_at?: string
          verarbeitet_in_werk?: string | null
        }
        Relationships: []
      }
      format: {
        Row: {
          breite_mm: number | null
          code: string
          created_at: string
          hoehe_mm: number | null
          id: string
          is_active: boolean
          kategorie: string
          name: string
          notiz: string | null
          updated_at: string
        }
        Insert: {
          breite_mm?: number | null
          code: string
          created_at?: string
          hoehe_mm?: number | null
          id?: string
          is_active?: boolean
          kategorie?: string
          name: string
          notiz?: string | null
          updated_at?: string
        }
        Update: {
          breite_mm?: number | null
          code?: string
          created_at?: string
          hoehe_mm?: number | null
          id?: string
          is_active?: boolean
          kategorie?: string
          name?: string
          notiz?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      incoming_document: {
        Row: {
          advice_debit_date: string | null
          advice_reference: string[] | null
          cost_center_id: string | null
          created_at: string
          currency: string
          dedup_key: string
          discount_amount: number | null
          discount_date: string | null
          discount_percent: number | null
          doc_date: string | null
          doc_number: string | null
          doc_type: string
          due_date: string | null
          email_date: string | null
          email_from: string | null
          email_message_id: string | null
          email_subject: string | null
          extracted_at: string | null
          extraction: Json | null
          extraction_confidence: number | null
          extraction_model: string | null
          file_name: string | null
          file_sha256: string | null
          forwarded_at: string | null
          gross_amount: number | null
          id: string
          ledger_account: string | null
          net_amount: number | null
          net_due_date: string | null
          notes: string | null
          open_amount: number | null
          paid_at: string | null
          paid_total: number
          payee_differs: boolean
          payee_iban: string | null
          payee_name: string | null
          payee_reason: string | null
          payment_method: string | null
          payment_status: string
          pdf_storage_key: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          service_date: string | null
          skonto_amount: number
          source: string
          status: string
          supplier_iban: string | null
          supplier_name: string | null
          supplier_organization_id: string | null
          supplier_vat_id: string | null
          tax_amount: number | null
          tax_breakdown: Json | null
          tax_code_id: string | null
          updated_at: string
        }
        Insert: {
          advice_debit_date?: string | null
          advice_reference?: string[] | null
          cost_center_id?: string | null
          created_at?: string
          currency?: string
          dedup_key: string
          discount_amount?: number | null
          discount_date?: string | null
          discount_percent?: number | null
          doc_date?: string | null
          doc_number?: string | null
          doc_type?: string
          due_date?: string | null
          email_date?: string | null
          email_from?: string | null
          email_message_id?: string | null
          email_subject?: string | null
          extracted_at?: string | null
          extraction?: Json | null
          extraction_confidence?: number | null
          extraction_model?: string | null
          file_name?: string | null
          file_sha256?: string | null
          forwarded_at?: string | null
          gross_amount?: number | null
          id?: string
          ledger_account?: string | null
          net_amount?: number | null
          net_due_date?: string | null
          notes?: string | null
          open_amount?: number | null
          paid_at?: string | null
          paid_total?: number
          payee_differs?: boolean
          payee_iban?: string | null
          payee_name?: string | null
          payee_reason?: string | null
          payment_method?: string | null
          payment_status?: string
          pdf_storage_key?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_date?: string | null
          skonto_amount?: number
          source?: string
          status?: string
          supplier_iban?: string | null
          supplier_name?: string | null
          supplier_organization_id?: string | null
          supplier_vat_id?: string | null
          tax_amount?: number | null
          tax_breakdown?: Json | null
          tax_code_id?: string | null
          updated_at?: string
        }
        Update: {
          advice_debit_date?: string | null
          advice_reference?: string[] | null
          cost_center_id?: string | null
          created_at?: string
          currency?: string
          dedup_key?: string
          discount_amount?: number | null
          discount_date?: string | null
          discount_percent?: number | null
          doc_date?: string | null
          doc_number?: string | null
          doc_type?: string
          due_date?: string | null
          email_date?: string | null
          email_from?: string | null
          email_message_id?: string | null
          email_subject?: string | null
          extracted_at?: string | null
          extraction?: Json | null
          extraction_confidence?: number | null
          extraction_model?: string | null
          file_name?: string | null
          file_sha256?: string | null
          forwarded_at?: string | null
          gross_amount?: number | null
          id?: string
          ledger_account?: string | null
          net_amount?: number | null
          net_due_date?: string | null
          notes?: string | null
          open_amount?: number | null
          paid_at?: string | null
          paid_total?: number
          payee_differs?: boolean
          payee_iban?: string | null
          payee_name?: string | null
          payee_reason?: string | null
          payment_method?: string | null
          payment_status?: string
          pdf_storage_key?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_date?: string | null
          skonto_amount?: number
          source?: string
          status?: string
          supplier_iban?: string | null
          supplier_name?: string | null
          supplier_organization_id?: string | null
          supplier_vat_id?: string | null
          tax_amount?: number | null
          tax_breakdown?: Json | null
          tax_code_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incoming_document_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_center"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_document_supplier_organization_id_fkey"
            columns: ["supplier_organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_document_tax_code_id_fkey"
            columns: ["tax_code_id"]
            isOneToOne: false
            referencedRelation: "tax_code"
            referencedColumns: ["id"]
          },
        ]
      }
      incoming_document_allocation: {
        Row: {
          amount: number
          cost_center_id: string | null
          created_at: string
          id: string
          incoming_document_item_id: string
          link_type: string
          material_ref: string | null
          note: string | null
          sales_order_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          cost_center_id?: string | null
          created_at?: string
          id?: string
          incoming_document_item_id: string
          link_type: string
          material_ref?: string | null
          note?: string | null
          sales_order_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          cost_center_id?: string | null
          created_at?: string
          id?: string
          incoming_document_item_id?: string
          link_type?: string
          material_ref?: string | null
          note?: string | null
          sales_order_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incoming_document_allocation_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_center"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_document_allocation_incoming_document_item_id_fkey"
            columns: ["incoming_document_item_id"]
            isOneToOne: false
            referencedRelation: "incoming_document_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_document_allocation_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_order"
            referencedColumns: ["id"]
          },
        ]
      }
      incoming_document_item: {
        Row: {
          cost_center_id: string | null
          created_at: string
          description: string | null
          id: string
          incoming_document_id: string
          ledger_account: string | null
          linked_document_id: string | null
          material_ref: string | null
          net_amount: number | null
          position: number | null
          quantity: number | null
          raw: Json | null
          tax_code_id: string | null
          tax_rate: number | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          cost_center_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          incoming_document_id: string
          ledger_account?: string | null
          linked_document_id?: string | null
          material_ref?: string | null
          net_amount?: number | null
          position?: number | null
          quantity?: number | null
          raw?: Json | null
          tax_code_id?: string | null
          tax_rate?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          cost_center_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          incoming_document_id?: string
          ledger_account?: string | null
          linked_document_id?: string | null
          material_ref?: string | null
          net_amount?: number | null
          position?: number | null
          quantity?: number | null
          raw?: Json | null
          tax_code_id?: string | null
          tax_rate?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incoming_document_item_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_center"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_document_item_incoming_document_id_fkey"
            columns: ["incoming_document_id"]
            isOneToOne: false
            referencedRelation: "incoming_document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_document_item_linked_document_id_fkey"
            columns: ["linked_document_id"]
            isOneToOne: false
            referencedRelation: "incoming_document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incoming_document_item_tax_code_id_fkey"
            columns: ["tax_code_id"]
            isOneToOne: false
            referencedRelation: "tax_code"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice: {
        Row: {
          created_at: string
          finalized_at: string | null
          gross_total: number
          id: string
          invoice_date: string | null
          invoice_number: string | null
          net_total: number
          notiz: string | null
          organization_id: string
          pdf_storage_key: string | null
          source: string
          status: string
          tax_total: number
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          finalized_at?: string | null
          gross_total?: number
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          net_total?: number
          notiz?: string | null
          organization_id: string
          pdf_storage_key?: string | null
          source?: string
          status?: string
          tax_total?: number
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          finalized_at?: string | null
          gross_total?: number
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          net_total?: number
          notiz?: string | null
          organization_id?: string
          pdf_storage_key?: string | null
          source?: string
          status?: string
          tax_total?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_item: {
        Row: {
          abrechnung_id: string | null
          created_at: string
          description: string | null
          gross_amount: number
          id: string
          invoice_id: string
          net_amount: number
          position: number
          tax_amount: number
          tax_code_id: string | null
          updated_at: string
        }
        Insert: {
          abrechnung_id?: string | null
          created_at?: string
          description?: string | null
          gross_amount?: number
          id?: string
          invoice_id: string
          net_amount?: number
          position: number
          tax_amount?: number
          tax_code_id?: string | null
          updated_at?: string
        }
        Update: {
          abrechnung_id?: string | null
          created_at?: string
          description?: string | null
          gross_amount?: number
          id?: string
          invoice_id?: string
          net_amount?: number
          position?: number
          tax_amount?: number
          tax_code_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_item_abrechnung_id_fkey"
            columns: ["abrechnung_id"]
            isOneToOne: false
            referencedRelation: "abrechnung"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_item_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_item_tax_code_id_fkey"
            columns: ["tax_code_id"]
            isOneToOne: false
            referencedRelation: "tax_code"
            referencedColumns: ["id"]
          },
        ]
      }
      ip_adresse: {
        Row: {
          created_at: string
          geraet: string | null
          hersteller: string | null
          hostname: string | null
          id: string
          ip_adresse: string
          mac_adresse: string | null
          maschine_id: string | null
          notiz: string | null
          scan_datum: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          geraet?: string | null
          hersteller?: string | null
          hostname?: string | null
          id?: string
          ip_adresse: string
          mac_adresse?: string | null
          maschine_id?: string | null
          notiz?: string | null
          scan_datum?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          geraet?: string | null
          hersteller?: string | null
          hostname?: string | null
          id?: string
          ip_adresse?: string
          mac_adresse?: string | null
          maschine_id?: string | null
          notiz?: string | null
          scan_datum?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ip_adresse_maschine_id_fkey"
            columns: ["maschine_id"]
            isOneToOne: false
            referencedRelation: "maschine"
            referencedColumns: ["id"]
          },
        ]
      }
      job: {
        Row: {
          abhaengig_von: string[]
          aufhaenger: boolean
          auflage: number
          batch_id: string | null
          bauteil: string
          bindeseite: string | null
          cello: string
          cello_seiten: number
          created_at: string
          druckbogen: string | null
          durchmesser: string | null
          farbigkeit: string | null
          flux_order_id: string | null
          flux_order_item_id: string | null
          flux_paper_type: string | null
          flux_printer: string | null
          flux_product: string | null
          flux_services: Json
          flux_signature: string | null
          flux_status: string | null
          flux_status_at: string | null
          format: string | null
          id: string
          komponenten: Json
          netto_bogen: number | null
          notiz: string | null
          nutzen: number | null
          papier: string | null
          papier_material_id: string | null
          pdf_seiten: string | null
          pdf_storage_key: string | null
          portal_order_id: string | null
          quelle_regel: string | null
          schlaufen: number | null
          schlaufen_gesamt: number | null
          spiralfarbe: string | null
          status: string
          teilung: string | null
          typ: string
          updated_at: string
          verfahren: string | null
          versand_carrier_id: string | null
          versand_datum: string | null
          versand_label_storage_key: string | null
          versand_tracking: string | null
          zuschuss: number
        }
        Insert: {
          abhaengig_von?: string[]
          aufhaenger?: boolean
          auflage?: number
          batch_id?: string | null
          bauteil: string
          bindeseite?: string | null
          cello?: string
          cello_seiten?: number
          created_at?: string
          druckbogen?: string | null
          durchmesser?: string | null
          farbigkeit?: string | null
          flux_order_id?: string | null
          flux_order_item_id?: string | null
          flux_paper_type?: string | null
          flux_printer?: string | null
          flux_product?: string | null
          flux_services?: Json
          flux_signature?: string | null
          flux_status?: string | null
          flux_status_at?: string | null
          format?: string | null
          id?: string
          komponenten?: Json
          netto_bogen?: number | null
          notiz?: string | null
          nutzen?: number | null
          papier?: string | null
          papier_material_id?: string | null
          pdf_seiten?: string | null
          pdf_storage_key?: string | null
          portal_order_id?: string | null
          quelle_regel?: string | null
          schlaufen?: number | null
          schlaufen_gesamt?: number | null
          spiralfarbe?: string | null
          status?: string
          teilung?: string | null
          typ?: string
          updated_at?: string
          verfahren?: string | null
          versand_carrier_id?: string | null
          versand_datum?: string | null
          versand_label_storage_key?: string | null
          versand_tracking?: string | null
          zuschuss?: number
        }
        Update: {
          abhaengig_von?: string[]
          aufhaenger?: boolean
          auflage?: number
          batch_id?: string | null
          bauteil?: string
          bindeseite?: string | null
          cello?: string
          cello_seiten?: number
          created_at?: string
          druckbogen?: string | null
          durchmesser?: string | null
          farbigkeit?: string | null
          flux_order_id?: string | null
          flux_order_item_id?: string | null
          flux_paper_type?: string | null
          flux_printer?: string | null
          flux_product?: string | null
          flux_services?: Json
          flux_signature?: string | null
          flux_status?: string | null
          flux_status_at?: string | null
          format?: string | null
          id?: string
          komponenten?: Json
          netto_bogen?: number | null
          notiz?: string | null
          nutzen?: number | null
          papier?: string | null
          papier_material_id?: string | null
          pdf_seiten?: string | null
          pdf_storage_key?: string | null
          portal_order_id?: string | null
          quelle_regel?: string | null
          schlaufen?: number | null
          schlaufen_gesamt?: number | null
          spiralfarbe?: string | null
          status?: string
          teilung?: string | null
          typ?: string
          updated_at?: string
          verfahren?: string | null
          versand_carrier_id?: string | null
          versand_datum?: string | null
          versand_label_storage_key?: string | null
          versand_tracking?: string | null
          zuschuss?: number
        }
        Relationships: [
          {
            foreignKeyName: "druckjob_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batch"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "druckjob_papier_material_id_fkey"
            columns: ["papier_material_id"]
            isOneToOne: false
            referencedRelation: "material"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "druckjob_portal_order_id_fkey"
            columns: ["portal_order_id"]
            isOneToOne: false
            referencedRelation: "portal_order"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_versand_carrier_id_fkey"
            columns: ["versand_carrier_id"]
            isOneToOne: false
            referencedRelation: "carrier"
            referencedColumns: ["id"]
          },
        ]
      }
      job_datei: {
        Row: {
          bytes: number | null
          created_at: string
          filename: string | null
          herkunft: string
          id: string
          job_id: string
          storage_key: string
          updated_at: string
        }
        Insert: {
          bytes?: number | null
          created_at?: string
          filename?: string | null
          herkunft?: string
          id?: string
          job_id: string
          storage_key: string
          updated_at?: string
        }
        Update: {
          bytes?: number | null
          created_at?: string
          filename?: string | null
          herkunft?: string
          id?: string
          job_id?: string
          storage_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_datei_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_account: {
        Row: {
          created_at: string
          default_tax_code_id: string | null
          id: string
          is_active: boolean
          is_system: boolean
          kind: string
          name: string
          number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_tax_code_id?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          kind: string
          name: string
          number: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_tax_code_id?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          kind?: string
          name?: string
          number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_account_default_tax_code_id_fkey"
            columns: ["default_tax_code_id"]
            isOneToOne: false
            referencedRelation: "tax_code"
            referencedColumns: ["id"]
          },
        ]
      }
      maschine: {
        Row: {
          aktiv: boolean
          cost_center_id: string | null
          created_at: string
          druckverfahren: string | null
          farbe: string | null
          flux_printer_name: string | null
          flux_printer_status: string | null
          flux_printer_status_at: string | null
          formate: string[]
          geladen: Json
          id: string
          kapazitaet_bogen_h: number | null
          max_farben: number | null
          name: string
          notiz: string | null
          nummer: string | null
          sortierung: number
          typ: string
          updated_at: string
        }
        Insert: {
          aktiv?: boolean
          cost_center_id?: string | null
          created_at?: string
          druckverfahren?: string | null
          farbe?: string | null
          flux_printer_name?: string | null
          flux_printer_status?: string | null
          flux_printer_status_at?: string | null
          formate?: string[]
          geladen?: Json
          id?: string
          kapazitaet_bogen_h?: number | null
          max_farben?: number | null
          name: string
          notiz?: string | null
          nummer?: string | null
          sortierung?: number
          typ: string
          updated_at?: string
        }
        Update: {
          aktiv?: boolean
          cost_center_id?: string | null
          created_at?: string
          druckverfahren?: string | null
          farbe?: string | null
          flux_printer_name?: string | null
          flux_printer_status?: string | null
          flux_printer_status_at?: string | null
          formate?: string[]
          geladen?: Json
          id?: string
          kapazitaet_bogen_h?: number | null
          max_farben?: number | null
          name?: string
          notiz?: string | null
          nummer?: string | null
          sortierung?: number
          typ?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maschine_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_center"
            referencedColumns: ["id"]
          },
        ]
      }
      maschine_faehigkeit: {
        Row: {
          created_at: string
          faehigkeit_key: string
          maschine_id: string
          updated_at: string
          wert: Json
        }
        Insert: {
          created_at?: string
          faehigkeit_key: string
          maschine_id: string
          updated_at?: string
          wert: Json
        }
        Update: {
          created_at?: string
          faehigkeit_key?: string
          maschine_id?: string
          updated_at?: string
          wert?: Json
        }
        Relationships: [
          {
            foreignKeyName: "maschine_faehigkeit_faehigkeit_key_fkey"
            columns: ["faehigkeit_key"]
            isOneToOne: false
            referencedRelation: "faehigkeit"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "maschine_faehigkeit_maschine_id_fkey"
            columns: ["maschine_id"]
            isOneToOne: false
            referencedRelation: "maschine"
            referencedColumns: ["id"]
          },
        ]
      }
      material: {
        Row: {
          attribute: Json
          beschreibung: string | null
          bestand: number | null
          created_at: string
          einkaufs_einheit: string | null
          einkaufspreis: number | null
          flux_paper_type: string | null
          id: string
          is_active: boolean
          lagerort: string | null
          lieferant_org_id: string | null
          material_nummer: string | null
          name: string
          name_kurz: string | null
          rolle_id: string | null
          updated_at: string
          xano_ref: string | null
        }
        Insert: {
          attribute?: Json
          beschreibung?: string | null
          bestand?: number | null
          created_at?: string
          einkaufs_einheit?: string | null
          einkaufspreis?: number | null
          flux_paper_type?: string | null
          id?: string
          is_active?: boolean
          lagerort?: string | null
          lieferant_org_id?: string | null
          material_nummer?: string | null
          name: string
          name_kurz?: string | null
          rolle_id?: string | null
          updated_at?: string
          xano_ref?: string | null
        }
        Update: {
          attribute?: Json
          beschreibung?: string | null
          bestand?: number | null
          created_at?: string
          einkaufs_einheit?: string | null
          einkaufspreis?: number | null
          flux_paper_type?: string | null
          id?: string
          is_active?: boolean
          lagerort?: string | null
          lieferant_org_id?: string | null
          material_nummer?: string | null
          name?: string
          name_kurz?: string | null
          rolle_id?: string | null
          updated_at?: string
          xano_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_lieferant_org_id_fkey"
            columns: ["lieferant_org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_rolle_id_fkey"
            columns: ["rolle_id"]
            isOneToOne: false
            referencedRelation: "material_rolle"
            referencedColumns: ["id"]
          },
        ]
      }
      material_bezug: {
        Row: {
          bestand: number
          bezeichnung: string
          created_at: string
          druckbogen_id: string | null
          einheit: string
          einkaufspreis: number | null
          format: string | null
          id: string
          is_active: boolean
          lagerort: string | null
          lieferant_org_id: string | null
          material_id: string
          mindestbestand: number | null
          nutzen: number | null
          quelle_bezug_id: string | null
          rohbogen_id: string | null
          updated_at: string
        }
        Insert: {
          bestand?: number
          bezeichnung: string
          created_at?: string
          druckbogen_id?: string | null
          einheit?: string
          einkaufspreis?: number | null
          format?: string | null
          id?: string
          is_active?: boolean
          lagerort?: string | null
          lieferant_org_id?: string | null
          material_id: string
          mindestbestand?: number | null
          nutzen?: number | null
          quelle_bezug_id?: string | null
          rohbogen_id?: string | null
          updated_at?: string
        }
        Update: {
          bestand?: number
          bezeichnung?: string
          created_at?: string
          druckbogen_id?: string | null
          einheit?: string
          einkaufspreis?: number | null
          format?: string | null
          id?: string
          is_active?: boolean
          lagerort?: string | null
          lieferant_org_id?: string | null
          material_id?: string
          mindestbestand?: number | null
          nutzen?: number | null
          quelle_bezug_id?: string | null
          rohbogen_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_bezug_druckbogen_id_fkey"
            columns: ["druckbogen_id"]
            isOneToOne: false
            referencedRelation: "druckbogen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_bezug_lieferant_org_id_fkey"
            columns: ["lieferant_org_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_bezug_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "material"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_bezug_quelle_bezug_id_fkey"
            columns: ["quelle_bezug_id"]
            isOneToOne: false
            referencedRelation: "material_bezug"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_bezug_rohbogen_id_fkey"
            columns: ["rohbogen_id"]
            isOneToOne: false
            referencedRelation: "rohbogen"
            referencedColumns: ["id"]
          },
        ]
      }
      material_rolle: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort: number
          updated_at: string
          xano_ref: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort?: number
          updated_at?: string
          xano_ref?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort?: number
          updated_at?: string
          xano_ref?: string | null
        }
        Relationships: []
      }
      material_umbuchung: {
        Row: {
          erstellt_am: string
          erstellt_von: string | null
          id: string
          nutzen_verwendet: number | null
          quelle_bezug_id: string
          quelle_menge: number
          ziel_bezug_id: string
          ziel_menge: number
        }
        Insert: {
          erstellt_am?: string
          erstellt_von?: string | null
          id?: string
          nutzen_verwendet?: number | null
          quelle_bezug_id: string
          quelle_menge: number
          ziel_bezug_id: string
          ziel_menge: number
        }
        Update: {
          erstellt_am?: string
          erstellt_von?: string | null
          id?: string
          nutzen_verwendet?: number | null
          quelle_bezug_id?: string
          quelle_menge?: number
          ziel_bezug_id?: string
          ziel_menge?: number
        }
        Relationships: [
          {
            foreignKeyName: "material_umbuchung_quelle_bezug_id_fkey"
            columns: ["quelle_bezug_id"]
            isOneToOne: false
            referencedRelation: "material_bezug"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_umbuchung_ziel_bezug_id_fkey"
            columns: ["ziel_bezug_id"]
            isOneToOne: false
            referencedRelation: "material_bezug"
            referencedColumns: ["id"]
          },
        ]
      }
      notification: {
        Row: {
          context: Json
          created_at: string
          id: string
          level: string
          message: string
          read_at: string | null
          read_by: string | null
          source: string
          title: string
          updated_at: string
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          level?: string
          message: string
          read_at?: string | null
          read_by?: string | null
          source: string
          title: string
          updated_at?: string
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          level?: string
          message?: string
          read_at?: string | null
          read_by?: string | null
          source?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_read_by_fkey"
            columns: ["read_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      number_sequence: {
        Row: {
          current_value: number
          key: string
          padding: number
          period: string
          period_value: string
          prefix: string
          suffix: string
          updated_at: string
        }
        Insert: {
          current_value?: number
          key: string
          padding?: number
          period?: string
          period_value?: string
          prefix?: string
          suffix?: string
          updated_at?: string
        }
        Update: {
          current_value?: number
          key?: string
          padding?: number
          period?: string
          period_value?: string
          prefix?: string
          suffix?: string
          updated_at?: string
        }
        Relationships: []
      }
      opri_material_regel: {
        Row: {
          bedingung: Json
          bedruckt: boolean | null
          created_at: string
          ebene: string
          einheit: string
          flux_product: string | null
          flux_services: Json
          format: string | null
          grammatur: string | null
          gruppe_id: string | null
          herkunft: string | null
          id: string
          is_active: boolean
          material_id: string | null
          material_rolle: string | null
          mengen_formel: string
          modus: string
          name: string
          notiz: string | null
          option_match: string | null
          prio: number
          produktionshinweis: string | null
          seite: string | null
          stammartikel_id: string | null
          traegt_cello: boolean
          updated_at: string
          vernutzung_format: string | null
          verwendung: string | null
          zaehlt_zur_blockstaerke: boolean
        }
        Insert: {
          bedingung?: Json
          bedruckt?: boolean | null
          created_at?: string
          ebene: string
          einheit?: string
          flux_product?: string | null
          flux_services?: Json
          format?: string | null
          grammatur?: string | null
          gruppe_id?: string | null
          herkunft?: string | null
          id?: string
          is_active?: boolean
          material_id?: string | null
          material_rolle?: string | null
          mengen_formel?: string
          modus?: string
          name: string
          notiz?: string | null
          option_match?: string | null
          prio?: number
          produktionshinweis?: string | null
          seite?: string | null
          stammartikel_id?: string | null
          traegt_cello?: boolean
          updated_at?: string
          vernutzung_format?: string | null
          verwendung?: string | null
          zaehlt_zur_blockstaerke?: boolean
        }
        Update: {
          bedingung?: Json
          bedruckt?: boolean | null
          created_at?: string
          ebene?: string
          einheit?: string
          flux_product?: string | null
          flux_services?: Json
          format?: string | null
          grammatur?: string | null
          gruppe_id?: string | null
          herkunft?: string | null
          id?: string
          is_active?: boolean
          material_id?: string | null
          material_rolle?: string | null
          mengen_formel?: string
          modus?: string
          name?: string
          notiz?: string | null
          option_match?: string | null
          prio?: number
          produktionshinweis?: string | null
          seite?: string | null
          stammartikel_id?: string | null
          traegt_cello?: boolean
          updated_at?: string
          vernutzung_format?: string | null
          verwendung?: string | null
          zaehlt_zur_blockstaerke?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "opri_material_regel_gruppe_id_fkey"
            columns: ["gruppe_id"]
            isOneToOne: false
            referencedRelation: "opri_produkt_gruppe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opri_material_regel_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "material"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opri_material_regel_stammartikel_id_fkey"
            columns: ["stammartikel_id"]
            isOneToOne: false
            referencedRelation: "opri_stammartikel"
            referencedColumns: ["id"]
          },
        ]
      }
      opri_produkt_gruppe: {
        Row: {
          created_at: string
          druckverfahren: string | null
          flux_product: string | null
          flux_services: Json
          id: string
          is_active: boolean
          kuerzel: string
          name: string
          notiz: string | null
          titel_kuerzel: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          druckverfahren?: string | null
          flux_product?: string | null
          flux_services?: Json
          id?: string
          is_active?: boolean
          kuerzel: string
          name: string
          notiz?: string | null
          titel_kuerzel?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          druckverfahren?: string | null
          flux_product?: string | null
          flux_services?: Json
          id?: string
          is_active?: boolean
          kuerzel?: string
          name?: string
          notiz?: string | null
          titel_kuerzel?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      opri_sku: {
        Row: {
          attribute: Json
          bezeichnung: string | null
          created_at: string
          gruppe_kuerzel: string | null
          id: string
          is_active: boolean
          option_typ_name: string | null
          option_typ_sku: string | null
          sheet: string | null
          sku: string
          sku_norm: string
          stammartikel_id: string | null
          typ: string
          updated_at: string
          wert_name: string | null
        }
        Insert: {
          attribute?: Json
          bezeichnung?: string | null
          created_at?: string
          gruppe_kuerzel?: string | null
          id?: string
          is_active?: boolean
          option_typ_name?: string | null
          option_typ_sku?: string | null
          sheet?: string | null
          sku: string
          sku_norm: string
          stammartikel_id?: string | null
          typ: string
          updated_at?: string
          wert_name?: string | null
        }
        Update: {
          attribute?: Json
          bezeichnung?: string | null
          created_at?: string
          gruppe_kuerzel?: string | null
          id?: string
          is_active?: boolean
          option_typ_name?: string | null
          option_typ_sku?: string | null
          sheet?: string | null
          sku?: string
          sku_norm?: string
          stammartikel_id?: string | null
          typ?: string
          updated_at?: string
          wert_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opri_sku_stammartikel_id_fkey"
            columns: ["stammartikel_id"]
            isOneToOne: false
            referencedRelation: "opri_stammartikel"
            referencedColumns: ["id"]
          },
        ]
      }
      opri_stammartikel: {
        Row: {
          created_at: string
          flux_product: string | null
          flux_services: Json
          gruppe_id: string | null
          id: string
          is_active: boolean
          name: string
          notiz: string | null
          sku: string
          sku_norm: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          flux_product?: string | null
          flux_services?: Json
          gruppe_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          notiz?: string | null
          sku: string
          sku_norm: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          flux_product?: string | null
          flux_services?: Json
          gruppe_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notiz?: string | null
          sku?: string
          sku_norm?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opri_stammartikel_gruppe_id_fkey"
            columns: ["gruppe_id"]
            isOneToOne: false
            referencedRelation: "opri_produkt_gruppe"
            referencedColumns: ["id"]
          },
        ]
      }
      organization: {
        Row: {
          created_at: string
          customer_number: string | null
          customer_segment: string | null
          default_tax_treatment: Database["public"]["Enums"]["tax_treatment"]
          dunning_enabled: boolean
          email: string | null
          id: string
          legal_name: string | null
          name: string
          notes: string | null
          payment_terms_id: string | null
          phone: string | null
          price_group_id: string | null
          relation: Database["public"]["Enums"]["org_relation"]
          supplier_number: string | null
          tax_country: string
          updated_at: string
          vat_id: string | null
          vat_id_checked_at: string | null
          vat_id_valid: boolean | null
          website: string | null
        }
        Insert: {
          created_at?: string
          customer_number?: string | null
          customer_segment?: string | null
          default_tax_treatment?: Database["public"]["Enums"]["tax_treatment"]
          dunning_enabled?: boolean
          email?: string | null
          id?: string
          legal_name?: string | null
          name: string
          notes?: string | null
          payment_terms_id?: string | null
          phone?: string | null
          price_group_id?: string | null
          relation?: Database["public"]["Enums"]["org_relation"]
          supplier_number?: string | null
          tax_country?: string
          updated_at?: string
          vat_id?: string | null
          vat_id_checked_at?: string | null
          vat_id_valid?: boolean | null
          website?: string | null
        }
        Update: {
          created_at?: string
          customer_number?: string | null
          customer_segment?: string | null
          default_tax_treatment?: Database["public"]["Enums"]["tax_treatment"]
          dunning_enabled?: boolean
          email?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          notes?: string | null
          payment_terms_id?: string | null
          phone?: string | null
          price_group_id?: string | null
          relation?: Database["public"]["Enums"]["org_relation"]
          supplier_number?: string | null
          tax_country?: string
          updated_at?: string
          vat_id?: string | null
          vat_id_checked_at?: string | null
          vat_id_valid?: boolean | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_payment_terms_fk"
            columns: ["payment_terms_id"]
            isOneToOne: false
            referencedRelation: "payment_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_price_group_fk"
            columns: ["price_group_id"]
            isOneToOne: false
            referencedRelation: "price_group"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_external_ref: {
        Row: {
          created_at: string
          external_id: string
          id: string
          is_authoritative: boolean
          metadata: Json
          organization_id: string
          synced_at: string | null
          system: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          is_authoritative?: boolean
          metadata?: Json
          organization_id: string
          synced_at?: string | null
          system: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          is_authoritative?: boolean
          metadata?: Json
          organization_id?: string
          synced_at?: string | null
          system?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_external_ref_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_merge: {
        Row: {
          id: string
          loser_id: string
          loser_snapshot: Json
          merged_at: string
          merged_by: string | null
          note: string | null
          survivor_id: string
        }
        Insert: {
          id?: string
          loser_id: string
          loser_snapshot: Json
          merged_at?: string
          merged_by?: string | null
          note?: string | null
          survivor_id: string
        }
        Update: {
          id?: string
          loser_id?: string
          loser_snapshot?: Json
          merged_at?: string
          merged_by?: string | null
          note?: string | null
          survivor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_merge_survivor_id_fkey"
            columns: ["survivor_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      packmittel: {
        Row: {
          bestellnummer: string | null
          bezeichnung: string
          breite_mm: number | null
          created_at: string
          fefco: string | null
          hoehe_mm: number | null
          id: string
          interne_bezeichnung: string | null
          is_active: boolean
          kategorie: string | null
          laenge_mm: number | null
          lagerplatz: string | null
          leergewicht_kg: number
          material: string | null
          max_fuellgewicht_kg: number | null
          ninox_ref: string | null
          notiz: string | null
          preis_kalk: number | null
          updated_at: string
          volumen_m3: number | null
        }
        Insert: {
          bestellnummer?: string | null
          bezeichnung: string
          breite_mm?: number | null
          created_at?: string
          fefco?: string | null
          hoehe_mm?: number | null
          id?: string
          interne_bezeichnung?: string | null
          is_active?: boolean
          kategorie?: string | null
          laenge_mm?: number | null
          lagerplatz?: string | null
          leergewicht_kg?: number
          material?: string | null
          max_fuellgewicht_kg?: number | null
          ninox_ref?: string | null
          notiz?: string | null
          preis_kalk?: number | null
          updated_at?: string
          volumen_m3?: number | null
        }
        Update: {
          bestellnummer?: string | null
          bezeichnung?: string
          breite_mm?: number | null
          created_at?: string
          fefco?: string | null
          hoehe_mm?: number | null
          id?: string
          interne_bezeichnung?: string | null
          is_active?: boolean
          kategorie?: string | null
          laenge_mm?: number | null
          lagerplatz?: string | null
          leergewicht_kg?: number
          material?: string | null
          max_fuellgewicht_kg?: number | null
          ninox_ref?: string | null
          notiz?: string | null
          preis_kalk?: number | null
          updated_at?: string
          volumen_m3?: number | null
        }
        Relationships: []
      }
      packregel: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          ninox_ref: string | null
          notiz: string | null
          packmittel_id: string | null
          prio: number
          produkt_tag: string | null
          spedition_erlaubt: boolean
          stueck_bis: number
          stueck_von: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          ninox_ref?: string | null
          notiz?: string | null
          packmittel_id?: string | null
          prio?: number
          produkt_tag?: string | null
          spedition_erlaubt?: boolean
          stueck_bis: number
          stueck_von?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          ninox_ref?: string | null
          notiz?: string | null
          packmittel_id?: string | null
          prio?: number
          produkt_tag?: string | null
          spedition_erlaubt?: boolean
          stueck_bis?: number
          stueck_von?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packregel_packmittel_id_fkey"
            columns: ["packmittel_id"]
            isOneToOne: false
            referencedRelation: "packmittel"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_terms: {
        Row: {
          created_at: string
          discount_days: number
          discount_percent: number
          id: string
          name: string
          net_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_days?: number
          discount_percent?: number
          id?: string
          name: string
          net_days?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_days?: number
          discount_percent?: number
          id?: string
          name?: string
          net_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      payroll_booking: {
        Row: {
          amount: number
          beleg_datum: string | null
          belegfeld1: string | null
          belegfeld2: string | null
          bu_schluessel: string | null
          buchungstext: string | null
          created_at: string
          gegenkonto: string
          id: string
          import_id: string
          konto: string
          kost1: string | null
          kost2: string | null
          position: number
          raw: Json
          soll_haben: string
          updated_at: string
        }
        Insert: {
          amount: number
          beleg_datum?: string | null
          belegfeld1?: string | null
          belegfeld2?: string | null
          bu_schluessel?: string | null
          buchungstext?: string | null
          created_at?: string
          gegenkonto: string
          id?: string
          import_id: string
          konto: string
          kost1?: string | null
          kost2?: string | null
          position: number
          raw?: Json
          soll_haben: string
          updated_at?: string
        }
        Update: {
          amount?: number
          beleg_datum?: string | null
          belegfeld1?: string | null
          belegfeld2?: string | null
          bu_schluessel?: string | null
          buchungstext?: string | null
          created_at?: string
          gegenkonto?: string
          id?: string
          import_id?: string
          konto?: string
          kost1?: string | null
          kost2?: string | null
          position?: number
          raw?: Json
          soll_haben?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_booking_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "payroll_import"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_import: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mandanten_nr: string | null
          period_end: string | null
          period_start: string | null
          row_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mandanten_nr?: string | null
          period_end?: string | null
          period_start?: string | null
          row_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mandanten_nr?: string | null
          period_end?: string | null
          period_start?: string | null
          row_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      portal: {
        Row: {
          code: string
          config: Json
          created_at: string
          id: string
          is_active: boolean
          kind: string
          name: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_order: {
        Row: {
          abrechnung_id: string | null
          berechnet: boolean
          created_at: string
          currency: string | null
          deliver_date: string | null
          description: string | null
          error: string | null
          external_id: string
          external_reference: string | null
          flux_order_id: string | null
          flux_payload: Json | null
          flux_response: Json | null
          flux_sent_at: string | null
          flux_status: string | null
          flux_status_at: string | null
          flux_work_step: string | null
          forwarded_at: string | null
          id: string
          ist_rekla: boolean
          pdf_meta: Json | null
          pdf_seiten_tausch: boolean
          portal_id: string
          portal_state: string | null
          preis_id: string | null
          preis_netto: number | null
          preis_quelle: string | null
          production_order_id: string | null
          quantity: number | null
          raw: Json
          received_at: string
          reference_type: string | null
          rekla_vermerk: string | null
          resolve_result: Json | null
          resolved_at: string | null
          sender: Json | null
          ship_to: Json | null
          total_gross: number | null
          total_net: number | null
          updated_at: string
          versand_datum: string | null
        }
        Insert: {
          abrechnung_id?: string | null
          berechnet?: boolean
          created_at?: string
          currency?: string | null
          deliver_date?: string | null
          description?: string | null
          error?: string | null
          external_id: string
          external_reference?: string | null
          flux_order_id?: string | null
          flux_payload?: Json | null
          flux_response?: Json | null
          flux_sent_at?: string | null
          flux_status?: string | null
          flux_status_at?: string | null
          flux_work_step?: string | null
          forwarded_at?: string | null
          id?: string
          ist_rekla?: boolean
          pdf_meta?: Json | null
          pdf_seiten_tausch?: boolean
          portal_id: string
          portal_state?: string | null
          preis_id?: string | null
          preis_netto?: number | null
          preis_quelle?: string | null
          production_order_id?: string | null
          quantity?: number | null
          raw: Json
          received_at?: string
          reference_type?: string | null
          rekla_vermerk?: string | null
          resolve_result?: Json | null
          resolved_at?: string | null
          sender?: Json | null
          ship_to?: Json | null
          total_gross?: number | null
          total_net?: number | null
          updated_at?: string
          versand_datum?: string | null
        }
        Update: {
          abrechnung_id?: string | null
          berechnet?: boolean
          created_at?: string
          currency?: string | null
          deliver_date?: string | null
          description?: string | null
          error?: string | null
          external_id?: string
          external_reference?: string | null
          flux_order_id?: string | null
          flux_payload?: Json | null
          flux_response?: Json | null
          flux_sent_at?: string | null
          flux_status?: string | null
          flux_status_at?: string | null
          flux_work_step?: string | null
          forwarded_at?: string | null
          id?: string
          ist_rekla?: boolean
          pdf_meta?: Json | null
          pdf_seiten_tausch?: boolean
          portal_id?: string
          portal_state?: string | null
          preis_id?: string | null
          preis_netto?: number | null
          preis_quelle?: string | null
          production_order_id?: string | null
          quantity?: number | null
          raw?: Json
          received_at?: string
          reference_type?: string | null
          rekla_vermerk?: string | null
          resolve_result?: Json | null
          resolved_at?: string | null
          sender?: Json | null
          ship_to?: Json | null
          total_gross?: number | null
          total_net?: number | null
          updated_at?: string
          versand_datum?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_order_abrechnung_id_fkey"
            columns: ["abrechnung_id"]
            isOneToOne: false
            referencedRelation: "abrechnung"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_order_portal_id_fkey"
            columns: ["portal_id"]
            isOneToOne: false
            referencedRelation: "portal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_order_preis_id_fkey"
            columns: ["preis_id"]
            isOneToOne: false
            referencedRelation: "preis"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_order_file: {
        Row: {
          bytes: number | null
          created_at: string
          fetched_at: string | null
          filename: string | null
          id: string
          is_zip: boolean
          portal_order_id: string
          source_url: string | null
          storage_key: string | null
          typ: string
          updated_at: string
        }
        Insert: {
          bytes?: number | null
          created_at?: string
          fetched_at?: string | null
          filename?: string | null
          id?: string
          is_zip?: boolean
          portal_order_id: string
          source_url?: string | null
          storage_key?: string | null
          typ: string
          updated_at?: string
        }
        Update: {
          bytes?: number | null
          created_at?: string
          fetched_at?: string | null
          filename?: string | null
          id?: string
          is_zip?: boolean
          portal_order_id?: string
          source_url?: string | null
          storage_key?: string | null
          typ?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_order_file_portal_order_id_fkey"
            columns: ["portal_order_id"]
            isOneToOne: false
            referencedRelation: "portal_order"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_order_item: {
        Row: {
          created_at: string
          description: string | null
          id: string
          portal_order_id: string
          position: string | null
          quantity: number | null
          raw: Json | null
          sku: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          portal_order_id: string
          position?: string | null
          quantity?: number | null
          raw?: Json | null
          sku?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          portal_order_id?: string
          position?: string | null
          quantity?: number | null
          raw?: Json | null
          sku?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_order_item_portal_order_id_fkey"
            columns: ["portal_order_id"]
            isOneToOne: false
            referencedRelation: "portal_order"
            referencedColumns: ["id"]
          },
        ]
      }
      posting_rule: {
        Row: {
          confidence: number | null
          created_at: string
          expense_account: string | null
          id: string
          is_active: boolean
          note: string | null
          organization_id: string
          revenue_account: string | null
          sample_count: number
          source: string
          tax_code_id: string | null
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          expense_account?: string | null
          id?: string
          is_active?: boolean
          note?: string | null
          organization_id: string
          revenue_account?: string | null
          sample_count?: number
          source?: string
          tax_code_id?: string | null
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          expense_account?: string | null
          id?: string
          is_active?: boolean
          note?: string | null
          organization_id?: string
          revenue_account?: string | null
          sample_count?: number
          source?: string
          tax_code_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posting_rule_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posting_rule_tax_code_id_fkey"
            columns: ["tax_code_id"]
            isOneToOne: false
            referencedRelation: "tax_code"
            referencedColumns: ["id"]
          },
        ]
      }
      preis: {
        Row: {
          auflage: number
          blatt: number | null
          created_at: string
          farbigkeit: string | null
          format: string | null
          id: string
          kategorie: string
          liste_id: string
          notiz: string | null
          preis_netto: number
          produktgruppe: string | null
          sorte: string | null
          spalten_key: string
          updated_at: string
        }
        Insert: {
          auflage: number
          blatt?: number | null
          created_at?: string
          farbigkeit?: string | null
          format?: string | null
          id?: string
          kategorie: string
          liste_id: string
          notiz?: string | null
          preis_netto: number
          produktgruppe?: string | null
          sorte?: string | null
          spalten_key: string
          updated_at?: string
        }
        Update: {
          auflage?: number
          blatt?: number | null
          created_at?: string
          farbigkeit?: string | null
          format?: string | null
          id?: string
          kategorie?: string
          liste_id?: string
          notiz?: string | null
          preis_netto?: number
          produktgruppe?: string | null
          sorte?: string | null
          spalten_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "preis_liste_id_fkey"
            columns: ["liste_id"]
            isOneToOne: false
            referencedRelation: "preis_liste"
            referencedColumns: ["id"]
          },
        ]
      }
      preis_liste: {
        Row: {
          aufschlag_prozent: number
          basis_liste_id: string | null
          created_at: string
          gueltig_ab: string
          gueltig_bis: string | null
          id: string
          is_active: boolean
          lieferant: string | null
          name: string
          notiz: string | null
          updated_at: string
          waehrung: string
        }
        Insert: {
          aufschlag_prozent?: number
          basis_liste_id?: string | null
          created_at?: string
          gueltig_ab: string
          gueltig_bis?: string | null
          id?: string
          is_active?: boolean
          lieferant?: string | null
          name: string
          notiz?: string | null
          updated_at?: string
          waehrung?: string
        }
        Update: {
          aufschlag_prozent?: number
          basis_liste_id?: string | null
          created_at?: string
          gueltig_ab?: string
          gueltig_bis?: string | null
          id?: string
          is_active?: boolean
          lieferant?: string | null
          name?: string
          notiz?: string | null
          updated_at?: string
          waehrung?: string
        }
        Relationships: [
          {
            foreignKeyName: "preis_liste_basis_liste_id_fkey"
            columns: ["basis_liste_id"]
            isOneToOne: false
            referencedRelation: "preis_liste"
            referencedColumns: ["id"]
          },
        ]
      }
      price_group: {
        Row: {
          created_at: string
          discount_percent: number
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_percent?: number
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_percent?: number
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      produkt: {
        Row: {
          art: string
          beschreibung: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          sprache: string | null
          updated_at: string
        }
        Insert: {
          art?: string
          beschreibung?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sprache?: string | null
          updated_at?: string
        }
        Update: {
          art?: string
          beschreibung?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sprache?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      produkt_archiv: {
        Row: {
          created_at: string
          file_id: string
          id: string
          ip_key: string | null
          ordner: string
          original_name: string
          produkt_id: string
          seitenzahl: number | null
          size_bytes: number | null
        }
        Insert: {
          created_at?: string
          file_id: string
          id?: string
          ip_key?: string | null
          ordner: string
          original_name: string
          produkt_id: string
          seitenzahl?: number | null
          size_bytes?: number | null
        }
        Update: {
          created_at?: string
          file_id?: string
          id?: string
          ip_key?: string | null
          ordner?: string
          original_name?: string
          produkt_id?: string
          seitenzahl?: number | null
          size_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "produkt_archiv_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produkt_archiv_produkt_id_fkey"
            columns: ["produkt_id"]
            isOneToOne: false
            referencedRelation: "produkt"
            referencedColumns: ["id"]
          },
        ]
      }
      produkt_kapitel: {
        Row: {
          created_at: string
          file_id: string | null
          hauptregister_teil_id: string | null
          id: string
          name: string
          nr: string
          produkt_id: string
          sortierung: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          file_id?: string | null
          hauptregister_teil_id?: string | null
          id?: string
          name: string
          nr: string
          produkt_id: string
          sortierung?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          file_id?: string | null
          hauptregister_teil_id?: string | null
          id?: string
          name?: string
          nr?: string
          produkt_id?: string
          sortierung?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produkt_kapitel_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produkt_kapitel_hauptregister_teil_id_fkey"
            columns: ["hauptregister_teil_id"]
            isOneToOne: false
            referencedRelation: "produktteil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produkt_kapitel_produkt_id_fkey"
            columns: ["produkt_id"]
            isOneToOne: false
            referencedRelation: "produkt"
            referencedColumns: ["id"]
          },
        ]
      }
      produktteil: {
        Row: {
          attribute: Json
          created_at: string
          farbigkeit: string | null
          hauptregister_teil_id: string | null
          id: string
          kapitel_id: string | null
          material_id: string | null
          nr: string | null
          produkt_id: string
          register_position: number | null
          register_teile: number | null
          seitenzahl: number | null
          sortierung: number
          titel: string | null
          typ: string
          updated_at: string
        }
        Insert: {
          attribute?: Json
          created_at?: string
          farbigkeit?: string | null
          hauptregister_teil_id?: string | null
          id?: string
          kapitel_id?: string | null
          material_id?: string | null
          nr?: string | null
          produkt_id: string
          register_position?: number | null
          register_teile?: number | null
          seitenzahl?: number | null
          sortierung?: number
          titel?: string | null
          typ: string
          updated_at?: string
        }
        Update: {
          attribute?: Json
          created_at?: string
          farbigkeit?: string | null
          hauptregister_teil_id?: string | null
          id?: string
          kapitel_id?: string | null
          material_id?: string | null
          nr?: string | null
          produkt_id?: string
          register_position?: number | null
          register_teile?: number | null
          seitenzahl?: number | null
          sortierung?: number
          titel?: string | null
          typ?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produktteil_hauptregister_teil_id_fkey"
            columns: ["hauptregister_teil_id"]
            isOneToOne: false
            referencedRelation: "produktteil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produktteil_kapitel_fk"
            columns: ["kapitel_id"]
            isOneToOne: false
            referencedRelation: "produkt_kapitel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produktteil_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "material"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produktteil_produkt_id_fkey"
            columns: ["produkt_id"]
            isOneToOne: false
            referencedRelation: "produkt"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produktteil_typ_fkey"
            columns: ["typ"]
            isOneToOne: false
            referencedRelation: "produktteil_typ"
            referencedColumns: ["key"]
          },
        ]
      }
      produktteil_datei: {
        Row: {
          created_at: string
          file_id: string
          id: string
          produktteil_id: string
          quelle: string | null
          reihenfolge: number
          seite_bis: number | null
          seite_von: number | null
        }
        Insert: {
          created_at?: string
          file_id: string
          id?: string
          produktteil_id: string
          quelle?: string | null
          reihenfolge?: number
          seite_bis?: number | null
          seite_von?: number | null
        }
        Update: {
          created_at?: string
          file_id?: string
          id?: string
          produktteil_id?: string
          quelle?: string | null
          reihenfolge?: number
          seite_bis?: number | null
          seite_von?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "produktteil_datei_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produktteil_datei_produktteil_id_fkey"
            columns: ["produktteil_id"]
            isOneToOne: false
            referencedRelation: "produktteil"
            referencedColumns: ["id"]
          },
        ]
      }
      produktteil_typ: {
        Row: {
          hat_register: boolean
          key: string
          label: string
          sortierung: number
        }
        Insert: {
          hat_register?: boolean
          key: string
          label: string
          sortierung?: number
        }
        Update: {
          hat_register?: boolean
          key?: string
          label?: string
          sortierung?: number
        }
        Relationships: []
      }
      rohbogen: {
        Row: {
          breite_mm: number
          code: string
          created_at: string
          hoehe_mm: number
          id: string
          is_active: boolean
          name: string
          notiz: string | null
          updated_at: string
        }
        Insert: {
          breite_mm: number
          code: string
          created_at?: string
          hoehe_mm: number
          id?: string
          is_active?: boolean
          name: string
          notiz?: string | null
          updated_at?: string
        }
        Update: {
          breite_mm?: number
          code?: string
          created_at?: string
          hoehe_mm?: number
          id?: string
          is_active?: boolean
          name?: string
          notiz?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sales_invoice: {
        Row: {
          billing_address_snapshot: Json | null
          business_unit_id: number | null
          contact_id: string | null
          created_at: string
          currency: string
          due_date: string | null
          external_id: string | null
          gross_total: number | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          kind: string
          net_total: number | null
          open_amount: number | null
          organization_id: string | null
          paid_at: string | null
          paid_total: number | null
          payment_status: string
          pdf_status: string
          pdf_storage_key: string | null
          pdf_synced_at: string | null
          raw: Json | null
          reversed_invoice_external_id: string | null
          sales_order_id: string | null
          service_date: string | null
          skonto_amount: number
          source: string
          synced_at: string | null
          tax_breakdown: Json | null
          tax_total: number | null
          updated_at: string
        }
        Insert: {
          billing_address_snapshot?: Json | null
          business_unit_id?: number | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          due_date?: string | null
          external_id?: string | null
          gross_total?: number | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          kind?: string
          net_total?: number | null
          open_amount?: number | null
          organization_id?: string | null
          paid_at?: string | null
          paid_total?: number | null
          payment_status?: string
          pdf_status?: string
          pdf_storage_key?: string | null
          pdf_synced_at?: string | null
          raw?: Json | null
          reversed_invoice_external_id?: string | null
          sales_order_id?: string | null
          service_date?: string | null
          skonto_amount?: number
          source: string
          synced_at?: string | null
          tax_breakdown?: Json | null
          tax_total?: number | null
          updated_at?: string
        }
        Update: {
          billing_address_snapshot?: Json | null
          business_unit_id?: number | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          due_date?: string | null
          external_id?: string | null
          gross_total?: number | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          kind?: string
          net_total?: number | null
          open_amount?: number | null
          organization_id?: string | null
          paid_at?: string | null
          paid_total?: number | null
          payment_status?: string
          pdf_status?: string
          pdf_storage_key?: string | null
          pdf_synced_at?: string | null
          raw?: Json | null
          reversed_invoice_external_id?: string | null
          sales_order_id?: string | null
          service_date?: string | null
          skonto_amount?: number
          source?: string
          synced_at?: string | null
          tax_breakdown?: Json | null
          tax_total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoice_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoice_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoice_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_order"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_invoice_booking: {
        Row: {
          created_at: string
          gross_amount: number
          id: string
          ledger_account: string
          net_amount: number
          sales_invoice_id: string
          tax_amount: number
          tax_rate: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          gross_amount: number
          id?: string
          ledger_account: string
          net_amount: number
          sales_invoice_id: string
          tax_amount: number
          tax_rate?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          gross_amount?: number
          id?: string
          ledger_account?: string
          net_amount?: number
          sales_invoice_id?: string
          tax_amount?: number
          tax_rate?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoice_booking_sales_invoice_id_fkey"
            columns: ["sales_invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoice"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_invoice_item: {
        Row: {
          created_at: string
          description: string | null
          external_id: string | null
          id: string
          net_amount: number | null
          position: number | null
          quantity: number | null
          raw: Json | null
          sales_invoice_id: string
          source: string
          tax_rate: number | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          external_id?: string | null
          id?: string
          net_amount?: number | null
          position?: number | null
          quantity?: number | null
          raw?: Json | null
          sales_invoice_id: string
          source: string
          tax_rate?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          external_id?: string | null
          id?: string
          net_amount?: number | null
          position?: number | null
          quantity?: number | null
          raw?: Json | null
          sales_invoice_id?: string
          source?: string
          tax_rate?: number | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoice_item_sales_invoice_id_fkey"
            columns: ["sales_invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoice"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order: {
        Row: {
          business_unit_id: number | null
          contact_id: string | null
          created_at: string
          currency: string
          delivery_date: string | null
          due_date: string | null
          external_id: string | null
          id: string
          net_total: number | null
          order_date: string | null
          order_number: string | null
          organization_id: string | null
          raw: Json | null
          source: string
          state: string | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          business_unit_id?: number | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          delivery_date?: string | null
          due_date?: string | null
          external_id?: string | null
          id?: string
          net_total?: number | null
          order_date?: string | null
          order_number?: string | null
          organization_id?: string | null
          raw?: Json | null
          source: string
          state?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          business_unit_id?: number | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          delivery_date?: string | null
          due_date?: string | null
          external_id?: string | null
          id?: string
          net_total?: number | null
          order_date?: string | null
          order_number?: string | null
          organization_id?: string | null
          raw?: Json | null
          source?: string
          state?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_item: {
        Row: {
          created_at: string
          description: string | null
          external_id: string | null
          id: string
          kind: string | null
          net_amount: number | null
          position: number | null
          quantity: number | null
          raw: Json | null
          sales_order_id: string
          source: string
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          external_id?: string | null
          id?: string
          kind?: string | null
          net_amount?: number | null
          position?: number | null
          quantity?: number | null
          raw?: Json | null
          sales_order_id: string
          source: string
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          external_id?: string | null
          id?: string
          kind?: string | null
          net_amount?: number | null
          position?: number | null
          quantity?: number | null
          raw?: Json | null
          sales_order_id?: string
          source?: string
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_item_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_order"
            referencedColumns: ["id"]
          },
        ]
      }
      setting: {
        Row: {
          key: string
          scope: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          scope?: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          scope?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      shipment: {
        Row: {
          carrier_id: string | null
          carrier_service: string | null
          contact_id: string | null
          created_at: string
          frankatur: string | null
          id: string
          keyline_shipment_ref: string | null
          neutral_versand: boolean
          notify_email: string | null
          notify_recipient: boolean
          notiz: string | null
          organization_id: string
          sales_order_id: string | null
          sender_addition: string | null
          sender_address_addition: string | null
          sender_city: string | null
          sender_country: string | null
          sender_house_number: string | null
          sender_mode: string
          sender_name: string | null
          sender_street: string | null
          sender_zip: string | null
          ship_date: string | null
          shipment_number: string | null
          status: string
          total_weight_kg: number | null
          updated_at: string
          weight_mode: string
        }
        Insert: {
          carrier_id?: string | null
          carrier_service?: string | null
          contact_id?: string | null
          created_at?: string
          frankatur?: string | null
          id?: string
          keyline_shipment_ref?: string | null
          neutral_versand?: boolean
          notify_email?: string | null
          notify_recipient?: boolean
          notiz?: string | null
          organization_id: string
          sales_order_id?: string | null
          sender_addition?: string | null
          sender_address_addition?: string | null
          sender_city?: string | null
          sender_country?: string | null
          sender_house_number?: string | null
          sender_mode?: string
          sender_name?: string | null
          sender_street?: string | null
          sender_zip?: string | null
          ship_date?: string | null
          shipment_number?: string | null
          status?: string
          total_weight_kg?: number | null
          updated_at?: string
          weight_mode?: string
        }
        Update: {
          carrier_id?: string | null
          carrier_service?: string | null
          contact_id?: string | null
          created_at?: string
          frankatur?: string | null
          id?: string
          keyline_shipment_ref?: string | null
          neutral_versand?: boolean
          notify_email?: string | null
          notify_recipient?: boolean
          notiz?: string | null
          organization_id?: string
          sales_order_id?: string | null
          sender_addition?: string | null
          sender_address_addition?: string | null
          sender_city?: string | null
          sender_country?: string | null
          sender_house_number?: string | null
          sender_mode?: string
          sender_name?: string | null
          sender_street?: string | null
          sender_zip?: string | null
          ship_date?: string | null
          shipment_number?: string | null
          status?: string
          total_weight_kg?: number | null
          updated_at?: string
          weight_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carrier"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contact"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_order"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_item: {
        Row: {
          created_at: string
          customs_tariff_no: string | null
          customs_value: number | null
          description: string
          id: string
          note: string | null
          origin_country: string | null
          position: number
          quantity: number
          sales_order_item_id: string | null
          shipment_recipient_id: string
          unit: string | null
          updated_at: string
          versand_artikel_id: string | null
          weight_kg: number | null
        }
        Insert: {
          created_at?: string
          customs_tariff_no?: string | null
          customs_value?: number | null
          description: string
          id?: string
          note?: string | null
          origin_country?: string | null
          position?: number
          quantity?: number
          sales_order_item_id?: string | null
          shipment_recipient_id: string
          unit?: string | null
          updated_at?: string
          versand_artikel_id?: string | null
          weight_kg?: number | null
        }
        Update: {
          created_at?: string
          customs_tariff_no?: string | null
          customs_value?: number | null
          description?: string
          id?: string
          note?: string | null
          origin_country?: string | null
          position?: number
          quantity?: number
          sales_order_item_id?: string | null
          shipment_recipient_id?: string
          unit?: string | null
          updated_at?: string
          versand_artikel_id?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_item_sales_order_item_id_fkey"
            columns: ["sales_order_item_id"]
            isOneToOne: false
            referencedRelation: "sales_order_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_item_shipment_recipient_id_fkey"
            columns: ["shipment_recipient_id"]
            isOneToOne: false
            referencedRelation: "shipment_recipient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_item_versand_artikel_id_fkey"
            columns: ["versand_artikel_id"]
            isOneToOne: false
            referencedRelation: "versand_artikel"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_package: {
        Row: {
          art: string
          created_at: string
          height_cm: number | null
          id: string
          label_storage_key: string | null
          length_cm: number | null
          packaging_ref: string | null
          packmittel_id: string | null
          position: number
          shipment_recipient_id: string
          tracking_number: string | null
          updated_at: string
          weight_kg: number | null
          width_cm: number | null
        }
        Insert: {
          art?: string
          created_at?: string
          height_cm?: number | null
          id?: string
          label_storage_key?: string | null
          length_cm?: number | null
          packaging_ref?: string | null
          packmittel_id?: string | null
          position?: number
          shipment_recipient_id: string
          tracking_number?: string | null
          updated_at?: string
          weight_kg?: number | null
          width_cm?: number | null
        }
        Update: {
          art?: string
          created_at?: string
          height_cm?: number | null
          id?: string
          label_storage_key?: string | null
          length_cm?: number | null
          packaging_ref?: string | null
          packmittel_id?: string | null
          position?: number
          shipment_recipient_id?: string
          tracking_number?: string | null
          updated_at?: string
          weight_kg?: number | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_package_packmittel_id_fkey"
            columns: ["packmittel_id"]
            isOneToOne: false
            referencedRelation: "packmittel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_package_shipment_recipient_id_fkey"
            columns: ["shipment_recipient_id"]
            isOneToOne: false
            referencedRelation: "shipment_recipient"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_recipient: {
        Row: {
          addition: string | null
          address_addition: string | null
          city: string | null
          contact_name: string | null
          country: string
          created_at: string
          email: string | null
          house_number: string | null
          id: string
          name: string
          phone: string | null
          position: number
          shipment_id: string
          source_address_id: string | null
          street: string | null
          updated_at: string
          verified: boolean
          verified_at: string | null
          verified_by: string | null
          verify_result: Json | null
          zip: string | null
        }
        Insert: {
          addition?: string | null
          address_addition?: string | null
          city?: string | null
          contact_name?: string | null
          country?: string
          created_at?: string
          email?: string | null
          house_number?: string | null
          id?: string
          name: string
          phone?: string | null
          position?: number
          shipment_id: string
          source_address_id?: string | null
          street?: string | null
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
          verify_result?: Json | null
          zip?: string | null
        }
        Update: {
          addition?: string | null
          address_addition?: string | null
          city?: string | null
          contact_name?: string | null
          country?: string
          created_at?: string
          email?: string | null
          house_number?: string | null
          id?: string
          name?: string
          phone?: string | null
          position?: number
          shipment_id?: string
          source_address_id?: string | null
          street?: string | null
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
          verify_result?: Json | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_recipient_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_recipient_source_address_id_fkey"
            columns: ["source_address_id"]
            isOneToOne: false
            referencedRelation: "address"
            referencedColumns: ["id"]
          },
        ]
      }
      standbogen: {
        Row: {
          aktiv: boolean
          ausrichtung: string | null
          bezeichnung: string
          created_at: string
          druckbogen: string | null
          flux_signature: string
          format: string
          id: string
          notiz: string | null
          nutzen: number | null
          sortierung: number
          updated_at: string
        }
        Insert: {
          aktiv?: boolean
          ausrichtung?: string | null
          bezeichnung: string
          created_at?: string
          druckbogen?: string | null
          flux_signature: string
          format: string
          id?: string
          notiz?: string | null
          nutzen?: number | null
          sortierung?: number
          updated_at?: string
        }
        Update: {
          aktiv?: boolean
          ausrichtung?: string | null
          bezeichnung?: string
          created_at?: string
          druckbogen?: string | null
          flux_signature?: string
          format?: string
          id?: string
          notiz?: string | null
          nutzen?: number | null
          sortierung?: number
          updated_at?: string
        }
        Relationships: []
      }
      sync_request: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          job: string
          notified_at: string | null
          params: Json
          requested_at: string
          requested_by: string | null
          result: Json | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          job: string
          notified_at?: string | null
          params?: Json
          requested_at?: string
          requested_by?: string | null
          result?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          job?: string
          notified_at?: string | null
          params?: Json
          requested_at?: string
          requested_by?: string | null
          result?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_request_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_code: {
        Row: {
          code: string
          created_at: string
          datev_tax_key: string | null
          direction: string
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          rate: number
          treatment: Database["public"]["Enums"]["tax_treatment"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          datev_tax_key?: string | null
          direction: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          rate?: number
          treatment: Database["public"]["Enums"]["tax_treatment"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          datev_tax_key?: string | null
          direction?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          rate?: number
          treatment?: Database["public"]["Enums"]["tax_treatment"]
          updated_at?: string
        }
        Relationships: []
      }
      user_role: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_role_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_role_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_user"
            referencedColumns: ["id"]
          },
        ]
      }
      vernutzung: {
        Row: {
          anordnung: string | null
          created_at: string
          druckbogen_id: string
          format_id: string
          gedreht: boolean
          id: string
          ist_standard: boolean
          notiz: string | null
          nutzen: number
          quelle: string
          randzugabe_mm: number
          updated_at: string
        }
        Insert: {
          anordnung?: string | null
          created_at?: string
          druckbogen_id: string
          format_id: string
          gedreht?: boolean
          id?: string
          ist_standard?: boolean
          notiz?: string | null
          nutzen?: number
          quelle?: string
          randzugabe_mm?: number
          updated_at?: string
        }
        Update: {
          anordnung?: string | null
          created_at?: string
          druckbogen_id?: string
          format_id?: string
          gedreht?: boolean
          id?: string
          ist_standard?: boolean
          notiz?: string | null
          nutzen?: number
          quelle?: string
          randzugabe_mm?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vernutzung_druckbogen_id_fkey"
            columns: ["druckbogen_id"]
            isOneToOne: false
            referencedRelation: "druckbogen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vernutzung_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "format"
            referencedColumns: ["id"]
          },
        ]
      }
      versand_artikel: {
        Row: {
          bezeichnung: string
          created_at: string
          ean: string | null
          einheit: string
          gewicht_kg: number
          id: string
          is_active: boolean
          notiz: string | null
          updated_at: string
        }
        Insert: {
          bezeichnung: string
          created_at?: string
          ean?: string | null
          einheit?: string
          gewicht_kg?: number
          id?: string
          is_active?: boolean
          notiz?: string | null
          updated_at?: string
        }
        Update: {
          bezeichnung?: string
          created_at?: string
          ean?: string | null
          einheit?: string
          gewicht_kg?: number
          id?: string
          is_active?: boolean
          notiz?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      wire_o_durchmesser: {
        Row: {
          bezeichnung: string | null
          blockstaerke_max: number
          blockstaerke_min: number
          bruch_ganzzahl: number | null
          bruch_oben: number | null
          bruch_unten: number | null
          created_at: string
          durchmesser_mm: number | null
          durchmesser_zoll: string | null
          id: string
          teilung: string
          updated_at: string
          xano_ref: string | null
        }
        Insert: {
          bezeichnung?: string | null
          blockstaerke_max: number
          blockstaerke_min: number
          bruch_ganzzahl?: number | null
          bruch_oben?: number | null
          bruch_unten?: number | null
          created_at?: string
          durchmesser_mm?: number | null
          durchmesser_zoll?: string | null
          id?: string
          teilung: string
          updated_at?: string
          xano_ref?: string | null
        }
        Update: {
          bezeichnung?: string | null
          blockstaerke_max?: number
          blockstaerke_min?: number
          bruch_ganzzahl?: number | null
          bruch_oben?: number | null
          bruch_unten?: number | null
          created_at?: string
          durchmesser_mm?: number | null
          durchmesser_zoll?: string | null
          id?: string
          teilung?: string
          updated_at?: string
          xano_ref?: string | null
        }
        Relationships: []
      }
      working_time_model: {
        Row: {
          break_rule: Json
          created_at: string
          id: string
          minutes_per_weekday: Json
          name: string
          updated_at: string
        }
        Insert: {
          break_rule?: Json
          created_at?: string
          id?: string
          minutes_per_weekday?: Json
          name: string
          updated_at?: string
        }
        Update: {
          break_rule?: Json
          created_at?: string
          id?: string
          minutes_per_weekday?: Json
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      attach_standard_triggers: {
        Args: { p_table: unknown }
        Returns: undefined
      }
      customer_org_ids: { Args: never; Returns: string[] }
      has_any_role: {
        Args: { p_roles: Database["public"]["Enums"]["app_role"][] }
        Returns: boolean
      }
      has_role: {
        Args: { p_role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      is_staff: { Args: never; Returns: boolean }
      material_umbuchen: {
        Args: { p_menge: number; p_quelle_id: string; p_ziel_id: string }
        Returns: {
          erstellt_am: string
          erstellt_von: string | null
          id: string
          nutzen_verwendet: number | null
          quelle_bezug_id: string
          quelle_menge: number
          ziel_bezug_id: string
          ziel_menge: number
        }
        SetofOptions: {
          from: "*"
          to: "material_umbuchung"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      merge_organization: {
        Args: { p_loser: string; p_survivor: string }
        Returns: Json
      }
      next_number: { Args: { p_date?: string; p_key: string }; Returns: string }
      recalc_incoming_payment: { Args: { p_id: string }; Returns: undefined }
      recalc_sales_invoice_payment: {
        Args: { p_id: string }
        Returns: undefined
      }
    }
    Enums: {
      address_kind: "billing" | "shipping" | "general"
      app_role:
        | "admin"
        | "office"
        | "accounting"
        | "production"
        | "shipping"
        | "employee"
        | "customer"
        | "supplier"
      app_user_kind: "employee" | "customer_contact" | "system"
      org_relation: "customer" | "supplier" | "both"
      tax_treatment:
        | "standard_de"
        | "reverse_charge_eu"
        | "intra_community_supply"
        | "export_third_country"
        | "tax_free_other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      address_kind: ["billing", "shipping", "general"],
      app_role: [
        "admin",
        "office",
        "accounting",
        "production",
        "shipping",
        "employee",
        "customer",
        "supplier",
      ],
      app_user_kind: ["employee", "customer_contact", "system"],
      org_relation: ["customer", "supplier", "both"],
      tax_treatment: [
        "standard_de",
        "reverse_charge_eu",
        "intra_community_supply",
        "export_third_country",
        "tax_free_other",
      ],
    },
  },
} as const
