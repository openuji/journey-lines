import { useState } from 'react';
import {
  ArrowDownUp,
  Camera,
  Globe,
  LogOut,
  MousePointerClick,
  Route,
  type LucideIcon,
} from 'lucide-react';
import type { MilestoneCapture, ViewEntry } from '@openuji/core';
import { formatClock, frameSrc, shortUrl, type CaptureKind } from '../../lib/journey';

const captureIcon: Record<CaptureKind, LucideIcon> = {
  view: Camera,
  scroll: ArrowDownUp,
  click: MousePointerClick,
  leave: LogOut,
};

/** Where a view starts: a page load or an SPA route change. */
export function ViewRow({ entry, url }: { entry: ViewEntry; url: string }) {
  const Icon = entry === 'load' ? Globe : Route;
  return (
    <li className="view-row" title={url}>
      <Icon size={14} strokeWidth={1.75} />
      <span className="view-row__url">{shortUrl(url)}</span>
      <span className="view-row__entry">{entry}</span>
    </li>
  );
}

/** One capture: when, what kind, what the rules called it, and the frame itself. */
export function CaptureRow({
  capture,
  captureKind,
  atMs,
}: {
  capture: MilestoneCapture;
  captureKind: CaptureKind;
  atMs: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = captureIcon[captureKind];

  return (
    <li className={`capture-row capture-row--${captureKind}`}>
      <span className="capture-row__time">{formatClock(atMs)}</span>
      <Icon className="capture-row__icon" size={16} strokeWidth={1.75} />
      <div className="capture-row__text">
        <span className="capture-row__label">{capture.label}</span>
        <span className="capture-row__detail">{capture.detail}</span>
      </div>
      <button
        className="capture-row__thumb"
        aria-label={expanded ? 'Collapse frame' : 'Expand frame'}
        onClick={() => setExpanded(!expanded)}
      >
        <img src={frameSrc(capture)} alt="" />
      </button>
      {expanded && <img className="capture-row__frame" src={frameSrc(capture)} alt={capture.label} />}
    </li>
  );
}
