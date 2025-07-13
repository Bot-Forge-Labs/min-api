const { createClient } = require("@supabase/supabase-js")

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Test connection
const testConnection = async () => {
  try {
    const { data, error } = await supabase.from("users").select("count").limit(1)
    if (error) {
      console.error("Supabase connection error:", error)
      return false
    }
    console.log("✅ Supabase connected successfully")
    return true
  } catch (error) {
    console.error("Supabase connection failed:", error)
    return false
  }
}

testConnection();

module.exports = { supabase, testConnection }
