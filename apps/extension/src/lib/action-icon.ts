const CLOSED_ACTION_ICON = {
  16: 'icons/action-16.png',
  24: 'icons/action-24.png',
  32: 'icons/action-32.png',
} as const;

const OPEN_ACTION_ICON = {
  16: 'icons/action-open-16.png',
  24: 'icons/action-open-24.png',
  32: 'icons/action-open-32.png',
} as const;

/** Keep the toolbar mark in step with the side panel's visible state. */
export function setActionIcon(open: boolean): Promise<void> {
  return chrome.action.setIcon({ path: open ? OPEN_ACTION_ICON : CLOSED_ACTION_ICON });
}
