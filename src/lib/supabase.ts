import { createClient } from '@supabase/supabase-js';

// These env vars are public-only configuration. If they are missing,
// placeholder text, or a secret key, feedback is disabled gracefully.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface SupabaseConfig {
  url: string;
  anonKey: string;
}

const getConfigValue = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const hasPlaceholderValue = (value: string) =>
  /^your[_-]?supabase/i.test(value) ||
  /^https:\/\/your-project/i.test(value) ||
  /example|placeholder|<.+>/.test(value.toLowerCase());

const getJwtRole = (key: string) => {
  const [, payload] = key.split('.');

  if (!payload) {
    return null;
  }

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return (JSON.parse(atob(paddedBase64)) as { role?: unknown }).role;
  } catch {
    return null;
  }
};

const isValidAnonKey = (key: string) => {
  const normalizedKey = key.toLowerCase();

  if (
    normalizedKey.includes('service_role') ||
    normalizedKey.includes('service-role') ||
    normalizedKey.startsWith('sb_secret_')
  ) {
    return false;
  }

  if (key.startsWith('sb_publishable_')) {
    return key.length > 'sb_publishable_'.length;
  }

  return key.split('.').length === 3 && getJwtRole(key) === 'anon';
};

const getSupabaseConfig = (): SupabaseConfig | null => {
  const url = getConfigValue(supabaseUrl);
  const anonKey = getConfigValue(supabaseAnonKey);

  if (!url || !anonKey || hasPlaceholderValue(url) || hasPlaceholderValue(anonKey)) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);

    if (!['https:', 'http:'].includes(parsedUrl.protocol) || !parsedUrl.hostname) {
      return null;
    }
  } catch {
    return null;
  }

  return isValidAnonKey(anonKey) ? { url, anonKey } : null;
};

const supabaseConfig = getSupabaseConfig();

if (!supabaseConfig) {
  console.warn('Supabase credentials are missing or invalid. Feedback feature will be disabled.');
}

export const supabase = supabaseConfig
  ? createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;

export type FeedbackType = 'bug' | 'suggestion' | 'feedback';

export interface FeedbackEntry {
  type: FeedbackType;
  message: string;
  theme: string;
  language: string;
  app_version: string;
}
