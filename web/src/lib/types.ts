export type AppRole = 'owner' | 'admin' | 'workshop'

export type Section =
  | 'dashboard'
  | 'projects'
  | 'customers'
  | 'invoices'
  | 'payments'
  | 'transactions'
  | 'reports'
  | 'users'
  | 'settings'

export interface Profile {
  id: string
  full_name: string
  phone: string | null
  role: AppRole
  is_active: boolean
}

export interface Customer {
  id: string
  customer_code: string | null
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  is_active: boolean
}

export interface Project {
  id: string
  project_code: string
  customer_id: string
  category_id: string | null
  title: string
  description: string | null
  location: string | null
  contract_value: number
  start_date: string | null
  target_completion_date: string | null
  actual_completion_date: string | null
  status: string
}

export interface InvoiceBalance {
  id: string
  invoice_number: string
  customer_id: string
  project_id: string | null
  issue_date: string
  due_date: string | null
  status: string
  total_amount: number
  paid_amount: number
  outstanding_amount: number
  display_status: string
}

export interface Transaction {
  id: string
  transaction_type: 'income' | 'expense'
  category_id: string | null
  project_id: string | null
  customer_id: string | null
  invoice_id: string | null
  transaction_date: string
  amount: number
  description: string
}
