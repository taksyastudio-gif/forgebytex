import { createClient } from '@supabase/supabase-js';
import type { EditorTheme, SupportedLanguage } from '../types/byteplay';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface FeedbackSubmission {
  type: 'bug' | 'suggestion' | 'feedback';
  message: string;
  theme: EditorTheme;
  language: SupportedLanguage;
  app_version: string;
}

/**
 * Submits user feedback to Supabase if configured, or falls back to
 * backend API `/api/feedback`.
 */
export async function submitUserFeedback(payload: FeedbackSubmission): Promise<void> {
  const trimmedMessage = payload.message.trim();

  if (!trimmedMessage) {
    throw new Error('Please enter a message.');
  }

  if (trimmedMessage.length > 5000) {
    throw new Error('Please keep your message under 5000 characters.');
  }

  // 1. Primary path: Supabase client submission
  if (supabase) {
    const { error } = await supabase.from('feedback').insert([
      {
        type: payload.type,
        message: trimmedMessage,
        theme: payload.theme,
        language: payload.language,
        app_version: payload.app_version,
      },
    ]);

    if (error) {
      throw new Error(error.message || 'Failed to submit feedback to Supabase.');
    }
    return;
  }

  // 2. Secondary path: Fallback to backend API if Supabase environment variables are missing
  const backendUrl = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '');
  if (!backendUrl) {
    throw new Error('Feedback service is unconfigured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  const response = await fetch(`${backendUrl}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      message: trimmedMessage,
    }),
  });

  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(result?.error || 'Failed to submit feedback.');
  }
}
