import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, useCurrentFrame, interpolate } from 'remotion';

// Identidade visual fixa do Calcula Prazo — o "Design System" do vídeo vive aqui, em código,
// não em prompt. Trocar cor/fonte/vinheta é editar este arquivo, nunca mais de uma vez.
const CORES = { navyEscuro: '#0A1628', navyMedio: '#0D2154', dourado: '#F4C542', azulClaro: '#60A5FA' };

function Cena({ imagem, textoTela }) {
  const frame = useCurrentFrame();
  // Ken Burns: zoom lento e contínuo, dá sensação de movimento numa imagem estática.
  const scale = interpolate(frame, [0, 150], [1, 1.12], { extrapolateRight: 'clamp' });
  const opacityTexto = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: CORES.navyEscuro }}>
      <Img
        src={imagem}
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})` }}
      />
      <AbsoluteFill
        style={{
          background: 'linear-gradient(to top, rgba(10,22,40,0.9) 0%, rgba(10,22,40,0.35) 30%, transparent 55%)',
        }}
      />
      <div
        style={{
          // bottom:340 fica acima da faixa que o YouTube Shorts cobre com botões/descrição/@canal;
          // right:150 evita a coluna de ícones (curtir/comentar/compartilhar) do lado direito.
          position: 'absolute', bottom: 340, left: 60, right: 150,
          opacity: opacityTexto,
        }}
      >
        <span
          style={{
            fontFamily: 'Outfit, sans-serif', fontSize: 44, fontWeight: 700,
            color: '#fff', lineHeight: 1.5,
            background: 'rgba(10,22,40,0.72)',
            boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone',
            padding: '6px 14px', borderRadius: 10,
            boxShadow: '0 2px 12px rgba(0,0,0,.35)',
          }}
        >
          {textoTela}
        </span>
      </div>
    </AbsoluteFill>
  );
}

export const OUTRO_FRAMES = 90; // 3 segundos a 30fps — fixo, sem IA nenhuma envolvida

// Recria a logo oficial do Calcula Prazo em SVG (ícone da balança + nome + domínio).
// É código, não imagem gerada — por isso fica sempre idêntico, sem erro de IA.
function Outro() {
  const frame = useCurrentFrame();
  const entrada = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const escala = interpolate(frame, [0, 20], [0.9, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 40%, ${CORES.navyMedio} 0%, ${CORES.navyEscuro} 70%)`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        opacity: entrada, transform: `scale(${escala})`,
      }}
    >
      <div
        style={{
          width: 220, height: 220, borderRadius: 48,
          background: `linear-gradient(160deg, ${CORES.azulClaro} 0%, #1E6FE0 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 60px ${CORES.azulClaro}55`,
        }}
      >
        <svg width="120" height="120" viewBox="0 0 100 100" fill="none">
          <line x1="50" y1="10" x2="50" y2="78" stroke="white" strokeWidth="5" strokeLinecap="round" />
          <line x1="20" y1="22" x2="80" y2="22" stroke="white" strokeWidth="5" strokeLinecap="round" />
          <path d="M20 22 L10 45 A12 12 0 0 0 30 45 Z" stroke="white" strokeWidth="4" fill="none" strokeLinejoin="round" />
          <path d="M80 22 L70 45 A12 12 0 0 0 90 45 Z" stroke="white" strokeWidth="4" fill="none" strokeLinejoin="round" />
          <line x1="10" y1="45" x2="30" y2="45" stroke="white" strokeWidth="3" strokeLinecap="round" />
          <line x1="70" y1="45" x2="90" y2="45" stroke="white" strokeWidth="3" strokeLinecap="round" />
          <path d="M32 82 Q50 72 68 82 L68 86 L32 86 Z" fill="white" />
        </svg>
      </div>
      <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 64, color: '#fff', marginTop: 36 }}>
        Calcula Prazo
      </div>
      <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 32, color: CORES.azulClaro, marginTop: 8 }}>
        calculaprazo.com.br
      </div>
    </AbsoluteFill>
  );
}

// props recebidas via input.json (ver scripts/07-render.mjs)
export function VideoDoArtigo({ cenas, narracaoSrc, fps }) {
  let inicioFrame = 0;
  const sequencias = cenas.map((cena, i) => {
    const duracaoFrames = Math.round(cena.duracao_seg * fps);
    const seq = (
      <Sequence key={i} from={inicioFrame} durationInFrames={duracaoFrames}>
        <Cena imagem={cena.imagemSrc} textoTela={cena.texto_tela} />
      </Sequence>
    );
    inicioFrame += duracaoFrames;
    return seq;
  });

  return (
    <AbsoluteFill style={{ background: CORES.navyEscuro }}>
      <Audio src={narracaoSrc} />
      {sequencias}
      <Sequence from={inicioFrame} durationInFrames={OUTRO_FRAMES}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
}
