import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, useCurrentFrame, interpolate } from 'remotion';

// Identidade visual fixa do Calcula Prazo — o "Design System" do vídeo vive aqui, em código,
// não em prompt. Trocar cor/fonte/vinheta é editar este arquivo, nunca mais de uma vez.
const CORES = {
  navyEscuro: '#0A1628',
  navyMedio: '#0D2154',
  dourado: '#F4C542',
  azulClaro: '#60A5FA',
};

function Cena({ imagem, textoTela, narracao }) {
  const frame = useCurrentFrame();
  // Ken Burns: zoom lento e contínuo, dá sensação de movimento numa imagem estática.
  const scale = interpolate(frame, [0, 150], [1, 1.12], { extrapolateRight: 'clamp' });
  const opacityTexto = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: CORES.navyEscuro }}>
      <Img
        src={imagem}
        style={{
          width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})`,
          // Fotos vindas de bancos de imagem diferentes têm luz/cor variadas — esse filtro +
          // o overlay de cor logo abaixo padronizam o tom pra "cara do canal" em toda cena,
          // independente da foto de origem.
          filter: 'saturate(0.88) contrast(1.04) brightness(0.97)',
        }}
      />
      <AbsoluteFill
        style={{ background: `linear-gradient(160deg, ${CORES.navyEscuro}59, ${CORES.azulClaro}1F)`, mixBlendMode: 'color' }}
      />
      <AbsoluteFill
        style={{
          background: 'linear-gradient(to top, rgba(10,22,40,0.92) 0%, rgba(10,22,40,0.45) 32%, transparent 58%)',
        }}
      />
      {/* CORREÇÃO (era o bug da legenda sobreposta na UI do Shorts):
          antes, texto_tela e narração tinham cada um seu próprio "bottom" fixo (340 e 250px).
          Numa tela de 1920px de altura, o YouTube Shorts reserva ~380-420px no rodapé pra
          @canal/título/descrição/barra de música, e ~150-170px na lateral direita pros ícones
          de curtir/comentar/compartilhar. bottom:250 caía DENTRO dessa faixa — por isso a
          legenda aparecia colada/ilegível em cima do título e do nome do canal no Shorts.
          A correção: um único bloco ancorado por "bottom" (não por "top"), que cresce pra CIMA
          conforme o texto ocupa mais linhas — assim o texto_tela nunca empurra a narração pra
          dentro da zona de risco, não importa o tamanho do roteiro daquela cena. */}
      <div
        style={{
          position: 'absolute', bottom: 460, left: 60, right: 170,
          display: 'flex', flexDirection: 'column', gap: 20,
          opacity: opacityTexto,
        }}
      >
        <div
          style={{
            fontFamily: 'Outfit, sans-serif', fontSize: 56, fontWeight: 800, lineHeight: 1.15,
            color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,.75)',
            borderLeft: `6px solid ${CORES.dourado}`, paddingLeft: 22,
          }}
        >
          {textoTela}
        </div>
        {/* Legenda "de verdade": o texto realmente falado (com pontuação) — atende a exigência
            de legenda/closed caption. Fundo sólido (em vez de só text-shadow) garante leitura
            mesmo sobre fotos claras ou de alto contraste, e dá aquele visual de "caption bar"
            que roda bem em formato viral. */}
        {narracao && (
          <div
            style={{
              alignSelf: 'flex-start', maxWidth: '100%',
              fontFamily: 'Inter, sans-serif', fontSize: 36, fontWeight: 600, lineHeight: 1.4,
              color: '#fff', background: 'rgba(10,22,40,0.78)', borderRadius: 14,
              padding: '10px 20px',
            }}
          >
            {narracao}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}

// Última cena: tela de chamada para ação 100% renderizada em código (nada de IA aqui).
// É o que resolve, de vez, o problema de cor errada / logotipo malformado no final do vídeo:
// a identidade visual sai sempre idêntica, pixel a pixel, em todo vídeo — porque usamos o
// PNG real do logo (icon-512.png, embutido em base64 pelo 07-render.mjs), não uma recriação.
function CenaFinal({ textoTela, logoSrc }) {
  const frame = useCurrentFrame();
  const opacityGeral = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });
  const subida = interpolate(frame, [0, 18], [24, 0], { extrapolateRight: 'clamp' });
  // Botão "respirando" — leve pulso contínuo pra chamar atenção sem ser irritante.
  const pulso = 1 + Math.sin(frame / 14) * 0.035;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 30%, ${CORES.navyMedio} 0%, ${CORES.navyEscuro} 70%)`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        opacity: opacityGeral, transform: `translateY(${subida}px)`,
      }}
    >
      {logoSrc && (
        <Img
          src={logoSrc}
          style={{ width: 180, height: 180, borderRadius: 40, boxShadow: '0 12px 40px rgba(0,0,0,.4)' }}
        />
      )}
      <div
        style={{
          marginTop: 28, fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: 56,
          color: '#fff', letterSpacing: -0.5,
        }}
      >
        Calcula Prazo
      </div>
      <div
        style={{
          marginTop: 8, fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 28,
          color: CORES.azulClaro,
        }}
      >
        calculaprazo.com.br
      </div>
      {textoTela && (
        <div
          style={{
            marginTop: 20, fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: 32,
            color: 'rgba(255,255,255,0.85)', textAlign: 'center', maxWidth: 780, padding: '0 40px',
          }}
        >
          {textoTela}
        </div>
      )}
      <div
        style={{
          marginTop: 44, background: CORES.dourado, color: CORES.navyEscuro,
          fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 32,
          padding: '20px 52px', borderRadius: 999, transform: `scale(${pulso})`,
          boxShadow: '0 8px 30px rgba(244,197,66,0.35)',
        }}
      >
        Acesse agora
      </div>
    </AbsoluteFill>
  );
}

// props recebidas via input.json (ver scripts/07-render.mjs)
export function VideoDoArtigo({ cenas, narracaoSrc, logoSrc, fps }) {
  let inicioFrame = 0;

  return (
    <AbsoluteFill style={{ background: CORES.navyEscuro }}>
      <Audio src={narracaoSrc} />
      {cenas.map((cena, i) => {
        const ehUltima = i === cenas.length - 1;
        const duracaoFrames = Math.round(cena.duracao_seg * fps);
        const seq = (
          <Sequence key={i} from={inicioFrame} durationInFrames={duracaoFrames}>
            {ehUltima ? (
              <CenaFinal textoTela={cena.texto_tela} logoSrc={logoSrc} />
            ) : (
              <Cena imagem={cena.imagemSrc} textoTela={cena.texto_tela} narracao={cena.narracao} />
            )}
          </Sequence>
        );
        inicioFrame += duracaoFrames;
        return seq;
      })}
    </AbsoluteFill>
  );
}
