export interface MacroFeed {
  source: string;
  url: string;
}

export const MACRO_FEEDS: readonly MacroFeed[] = [
  // ForexFactory weekly XML — gratis, eventos macro con nivel de impacto (Low/Medium/High)
  { source: "forexfactory", url: "https://nfs.faireconomy.media/ff_calendar_thisweek.xml" },
];
