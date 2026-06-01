import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: '/Users/iprite/perpos/apps/perpos/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Key missing in env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Querying just_me_travel_claims...');
  const { data: claims, error: cErr } = await supabase.from('just_me_travel_claims').select('*');
  if (cErr) console.error('Error:', cErr);
  else console.log('Claims:', JSON.stringify(claims, null, 2));

  console.log('Querying just_me_travel_logs...');
  const { data: logs, error: lErr } = await supabase.from('just_me_travel_logs').select('*');
  if (lErr) console.error('Error:', lErr);
  else console.log('Logs:', JSON.stringify(logs, null, 2));
}

run();
