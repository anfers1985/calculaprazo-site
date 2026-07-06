import { supabase } from './lib/supabase.mjs';

const { data, error } = await supabase
  .from('video_jobs')
  .select('id')
  .not('status', 'in', '("publicado")');

if (error) throw new Error(error.message);

// Formato exigido pelo GitHub Actions para virar matrix dinâmica.
console.log(`ids=${JSON.stringify(data.map(d => d.id))}`);
