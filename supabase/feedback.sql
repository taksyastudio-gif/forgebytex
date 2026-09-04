-- Supabase Feedback Schema & RLS Policies for ForgeByteX
-- Copy and execute this script in your Supabase SQL Editor.

-- 1. Create the feedback table if it does not already exist
CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('bug', 'suggestion', 'feedback')),
  message TEXT NOT NULL CHECK (char_length(trim(message)) > 0 AND char_length(message) <= 5000),
  theme TEXT NOT NULL,
  language TEXT NOT NULL,
  app_version TEXT NOT NULL DEFAULT '0.0.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Allow anonymous and authenticated users to submit feedback
DROP POLICY IF EXISTS "Allow public insert of feedback" ON public.feedback;
CREATE POLICY "Allow public insert of feedback"
  ON public.feedback
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 4. Security: Ensure feedback rows cannot be read by public/anonymous requests
REVOKE SELECT ON public.feedback FROM anon;
