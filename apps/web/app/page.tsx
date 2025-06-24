import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  let session = null
  
  // Only create Supabase client if environment variables are configured
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = createServerComponentClient({ cookies })
    const { data } = await supabase.auth.getSession()
    session = data.session
  }

  if (session) {
    redirect('/dashboard')
  } else {
    redirect('/login')
  }
} 