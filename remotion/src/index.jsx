import React from 'react';
import { Composition, getInputProps, registerRoot } from 'remotion';
import { VideoDoArtigo } from './VideoComposition.jsx';

const FPS = 30;
const input = getInputProps(); // vem de --props=output/remotion-input.json (ver 07-render.mjs)

const duracaoTotalSeg = (input.cenas || []).reduce((soma, c) => soma + c.duracao_seg, 0) || 10;

const RemotionRoot = () => (
  <Composition
    id="VideoDoArtigo"
    component={VideoDoArtigo}
    durationInFrames={Math.ceil(duracaoTotalSeg * FPS) + 30 /* margem de 1s no final */}
    fps={FPS}
    width={1080}
    height={1920} // formato vertical (Shorts). Para vídeo longo, trocar para 1920x1080.
    defaultProps={{ cenas: input.cenas || [], narracaoSrc: input.narracaoSrc || '', fps: FPS }}
  />
);

registerRoot(RemotionRoot);
