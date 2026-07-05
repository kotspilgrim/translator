const { createClient } = require('@supabase/supabase-js');

// null when SUPABASE_URL/SUPABASE_SERVICE_KEY aren't set — callers that treat
// Supabase as optional (translation logging) should check for that; auth.js
// treats it as required and fails loudly instead.
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

module.exports = supabase;
