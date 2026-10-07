/**
 * User input, played through CDP rather than a host's automation API, so the
 * conformance suite drives every host the same way.
 */

import type { CdpTransport } from '@openuji/cdp';

/** Input only sends commands, so any host's command channel will do. */
type CommandSender = Pick<CdpTransport, 'send'>;

export async function click(cdp: CommandSender, x: number, y: number): Promise<void> {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
}

/** The pointer moves over the point first, as a person's does before wheeling. */
export async function wheel(
  cdp: CommandSender,
  x: number,
  y: number,
  deltaY: number,
): Promise<void> {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x,
    y,
    deltaX: 0,
    deltaY,
  });
}

/** Windows virtual key codes, which Chrome needs to act on a key. */
const KEY_CODES = { PageDown: 34 } as const;

/** A key pressed and released, as on a keyboard. */
export async function press(cdp: CommandSender, key: keyof typeof KEY_CODES): Promise<void> {
  const keyEvent = { key, code: key, windowsVirtualKeyCode: KEY_CODES[key] };
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...keyEvent });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyEvent });
}
