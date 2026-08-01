// @ts-nocheck
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://jxyosutthiuzbrmdznoa.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__ar93u3tGlT6qILWxGTZdw_B1gt699R";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);