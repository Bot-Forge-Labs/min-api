const { createClient } = require('@supabase/supabase-js')

// Check for required environment variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  throw new Error('Missing Supabase environment variables. Please check SUPABASE_URL and SUPABASE_KEY.')
}

// Create Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: false
    }
  }
)

// Test connection
const testConnection = async () => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1)
    
    if (error) {
      console.warn('Database connection test failed:', error.message)
    } else {
      console.log('✅ Database connection successful')
    }
  } catch (err) {
    console.warn('Database connection test error:', err.message)
  }
}

// Test connection on startup
testConnection()

module.exports = { supabase }
