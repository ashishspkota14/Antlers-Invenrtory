// Owner-only: invite a person by email as a User or Manager.
// Deploy: npx supabase functions deploy invite-user
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Who is calling?
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: caller } = await admin.auth.getUser(jwt);
  if (!caller?.user) return json({ error: 'Please sign in again.' }, 401);

  const { data: me } = await admin.from('profiles').select('role').eq('id', caller.user.id).single();
  if (me?.role !== 'owner') return json({ error: 'Only an owner can invite people.' }, 403);

  // What are they asking for?
  const { email: rawEmail, role } = await req.json().catch(() => ({}));
  const email = String(rawEmail ?? '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Enter a valid email.' }, 400);
  if (role !== 'user' && role !== 'manager') return json({ error: 'Role must be User or Manager.' }, 400);

  const { data: isOwnerEmail } = await admin.from('owner_emails').select('email').eq('email', email).maybeSingle();
  if (isOwnerEmail) return json({ error: 'That email is already an owner.' }, 400);

  // Record the invite first: the new-user trigger reads it to set the role.
  const { error: inviteErr } = await admin
    .from('invites')
    .upsert({ email, role, invited_by: caller.user.id, created_at: new Date().toISOString() });
  if (inviteErr) return json({ error: inviteErr.message }, 500);

  // Already has an account? Just change the role.
  const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
  if (existing) {
    await admin.from('profiles').update({ role }).eq('id', existing.id);
    return json({ status: 'updated' });
  }

  const { error } = await admin.auth.admin.inviteUserByEmail(email, { data: { invited_role: role } });
  if (error) return json({ error: error.message }, 500);

  return json({ status: 'invited' });
});
