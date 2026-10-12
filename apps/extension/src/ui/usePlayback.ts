import { useId, useState } from 'react';

/** One playback state shared by its toggle and player, wherever they are placed. */
export function usePlayback() {
  const [playing, setPlaying] = useState(false);
  const controlsId = `clip-playback-${useId().replaceAll(':', '')}`;
  return { playing, controlsId, toggle: () => setPlaying((current) => !current) };
}
