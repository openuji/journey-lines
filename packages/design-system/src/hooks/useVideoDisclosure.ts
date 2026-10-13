import { useId, useState } from 'react';

/** Visibility state shared by a disclosure button and its video panel. */
export function useVideoDisclosure() {
  const [open, setOpen] = useState(false);
  const controlsId = `clip-playback-${useId().replaceAll(':', '')}`;
  return { open, controlsId, toggle: () => setOpen((current) => !current) };
}
