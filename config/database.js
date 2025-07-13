const { createClient } = require('@supabase/supabase-js')

// Check for required environment variables
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables:')
  console.error('SUPABASE_URL:', !!supabaseUrl)
  console.error('SUPABASE_KEY:', !!supabaseKey)
  throw new Error('Missing Supabase environment variables')
}

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey)

// Test connection function
async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('guilds')
      .select('count', { count: 'exact', head: true })
    
    if (error) {
      console.log('Supabase connected but tables may need setup:', error.message)
      return false
    }
    
    console.log('✅ Supabase connection successful')
    return true
  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message)
    return false
  }
}

module.exports = {
  supabase,
  testConnection
}
