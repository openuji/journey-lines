/**
 * User input, played through CDP rather than a host's automation API, so the
 * conformance suite drives every host the same way.
 */

import type { CdpTransport } from '@openuji/cdp';

/** Input only sends commands, so any host's command channel will do. */
type CommandSender = Pick<CdpTransport, 'send'>;

/** A click; `holdMs` keeps the button down that long, as a person's press does. */
export async function click(cdp: CommandSender, x: number, y: number, holdMs = 0): Promise<void> {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  if (holdMs > 0) await new Promise((resolve) => setTimeout(resolve, holdMs));
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

/** A key that activates what has focus — Enter, or Space — pressed and released. */
export async function activate(cdp: CommandSender, key: 'Enter' | 'Space'): Promise<void> {
  const keyEvent =
    key === 'Enter'
      ? { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }
      : { key: ' ', code: 'Space', windowsVirtualKeyCode: 32 };
  const text = key === 'Enter' ? '\r' : ' ';
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...keyEvent });
  await cdp.send('Input.dispatchKeyEvent', { type: 'char', text, ...keyEvent });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...keyEvent });
}
