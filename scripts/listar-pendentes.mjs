import { supabase } from './lib/supabase.mjs';

// Limite de tentativas: um job que já falhou muitas vezes seguidas provavelmente tem um
// problema real (chave de API, cota, etc.) que não vai se resolver sozinho. Sem esse limite,
// ele era pego de novo a cada hora, pra sempre, gastando minutos de Actions à toa.
const MAX_TENTATIVAS = 5;

const { data, error } = await supabase
  .from('video_jobs')
  .select('id')
  .not('status', 'in', '("publicado")')
  .lt('tentativas', MAX_TENTATIVAS);

if (error) throw new Error(error.message);

// Formato exigido pelo GitHub Actions para virar matrix dinâmica.
console.log(`ids=${JSON.stringify(data.map(d => d.id))}`);
