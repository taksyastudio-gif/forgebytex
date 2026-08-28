import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Feedback feature will be disabled.');
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export type FeedbackType = 'bug' | 'suggestion' | 'feedback';

export interface FeedbackEntry {
  type: FeedbackType;
  message: string;
  theme: string;
  language: string;
  app_version: string;
}
