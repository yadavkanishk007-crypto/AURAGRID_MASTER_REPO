import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://vufihzoqihpglreolfmc.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1Zmloem9xaWhwZ2xyZW9sZm1jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTY4MzI2MSwiZXhwIjoyMDk1MjU5MjYxfQ.5Y0PhuvFxu6VpgLvHhDtSwvRVBoCOyqR7KnxecLzCHw";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn("Supabase client initialized with fallback credentials.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
