// ============================================================
// Supabase client — عدّل القيم دي بمشروعك من Supabase Dashboard
// Settings > API > Project URL / anon public key
// ============================================================
const SUPABASE_URL = 'https://aagyaxicphooldhwycko.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhZ3lheGljcGhvb2xkaHd5Y2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1ODI0MTQsImV4cCI6MjEwMTE1ODQxNH0.IXId6VALd6WwufMwyHjwK12zYXAozPOXUdyjM4omUh4';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// حماية بسيطة: لو المستخدم مش مسجل دخول ودخل على صفحة محمية، رجّعه لصفحة الدخول
async function requireAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  return session;
}

async function getUserProfile(userId) {
  const { data, error } = await supabaseClient
    .from('users_profile')
    .select('*, roles(name, permissions), branches(id, name)')
    .eq('id', userId)
    .single();
  if (error) {
    console.error('getUserProfile error', error);
    return null;
  }
  return data;
}
