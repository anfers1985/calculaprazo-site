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

// Sino em SVG inline (emoji não é confiável no Chrome headless do runner: depende de fonte instalada).
function Sino({ tamanho = 28, cor = '#fff' }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

function Cena({ imagem, textoTela, narracao, logoSrc }) {
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
      {/* Marca d'água: aparece em toda cena, do início (inclusive a 1ª, que também vira a
          capa/thumbnail do vídeo) até a penúltima — só não aparece na tela final (CenaFinal),
          que já tem a logo grande em destaque. Canto superior esquerdo, longe da zona de UI
          do YouTube Shorts (que fica embaixo e à direita), pequena e semi-transparente pra
          não competir com o texto_tela/narração. */}
      {logoSrc && (
        <Img
          src={logoSrc}
          style={{
            position: 'absolute', top: 56, left: 48,
            width: 84, height: 84, borderRadius: 18,
            opacity: 0.85, boxShadow: '0 4px 16px rgba(0,0,0,.35)',
          }}
        />
      )}
      {/* Selo "Inscreva-se": ao lado da logo, no canto superior ESQUERDO — a lateral direita e o
          rodapé são zona de UI do Shorts; o topo direito tem os ícones de busca/câmera. */}
      {logoSrc && (
        <div
          style={{
            position: 'absolute', top: 76, left: 150,
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(10,22,40,0.72)', borderRadius: 999, padding: '10px 22px 10px 16px',
            fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 28, color: '#fff',
            border: `2px solid ${CORES.dourado}`,
          }}
        >
          <Sino tamanho={28} cor={CORES.dourado} />
          Inscreva-se no canal
        </div>
      )}
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
          // bottom:600 (era 460) — o YouTube passou a exibir um chip de "Dublagem automática"
          // bem em cima da linha do @canal em vídeos elegíveis, que não existia quando a folga
          // original foi calculada. Isso reduziu a margem real da legenda pra ~10-15px, fazendo
          // o chip cobrir a última linha da narração. 600 garante folga confortável mesmo com
          // esse chip (e outros badges que o YouTube possa adicionar no futuro nessa mesma faixa).
          position: 'absolute', bottom: 600, left: 60, right: 170,
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
          marginTop: 44, display: 'flex', alignItems: 'center', gap: 14,
          background: 'transparent', color: '#fff', border: `3px solid ${CORES.dourado}`,
          fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 32,
          padding: '18px 44px', borderRadius: 999,
        }}
      >
        <Sino tamanho={34} cor={CORES.dourado} />
        Inscreva-se no canal
      </div>
      <div
        style={{
          marginTop: 24, background: CORES.dourado, color: CORES.navyEscuro,
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
              <Cena imagem={cena.imagemSrc} textoTela={cena.texto_tela} narracao={cena.narracao} logoSrc={logoSrc} />
            )}
          </Sequence>
        );
        inicioFrame += duracaoFrames;
        return seq;
      })}
    </AbsoluteFill>
  );
}
