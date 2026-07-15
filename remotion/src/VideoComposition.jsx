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
          fontFamily: 'Outfit, sans-serif', fontSize: 50, fontWeight: 700,
          color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,.6)',
          opacity: opacityTexto,
        }}
      >
        {textoTela}
      </div>
    </AbsoluteFill>
  );
}

// props recebidas via input.json (ver scripts/07-render.mjs)
export function VideoDoArtigo({ cenas, narracaoSrc, fps }) {
  let inicioFrame = 0;

  return (
    <AbsoluteFill style={{ background: CORES.navyEscuro }}>
      <Audio src={narracaoSrc} />
      {cenas.map((cena, i) => {
        const duracaoFrames = Math.round(cena.duracao_seg * fps);
        const seq = (
          <Sequence key={i} from={inicioFrame} durationInFrames={duracaoFrames}>
            <Cena imagem={cena.imagemSrc} textoTela={cena.texto_tela} />
          </Sequence>
        );
        inicioFrame += duracaoFrames;
        return seq;
      })}
    </AbsoluteFill>
  );
}
