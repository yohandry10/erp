// Script para resetear contraseña en Supabase
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://ifivjoflcplenrgiyrmz.supabase.co'
const supabaseServiceKey = 'TU_SERVICE_ROLE_KEY_AQUI' // Necesitas el Service Role Key

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function resetPassword() {
  try {
    // Actualizar contraseña del usuario
    const { data, error } = await supabase.auth.admin.updateUserById(
      'USER_ID_AQUI', // Necesitas el UUID del usuario
      { password: 'nuevapassword123' }
    )
    
    if (error) {
      console.error('Error:', error)
    } else {
      console.log('✅ Contraseña actualizada:', data)
    }
  } catch (err) {
    console.error('Error:', err)
  }
}

resetPassword()