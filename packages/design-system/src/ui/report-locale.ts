import type { ReportLanguage } from '@journey-lines/journey';

export type ReportLocale = Readonly<{ language: ReportLanguage; dir: 'ltr' | 'rtl' }>;
export const defaultReportLocale: ReportLocale = Object.freeze({ language: 'en', dir: 'ltr' });
