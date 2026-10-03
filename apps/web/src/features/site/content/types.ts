export const SITE_PAGES = ['about', 'privacy', 'terms', 'credits', 'contact'] as const;
export type SitePageId = (typeof SITE_PAGES)[number];

export interface SiteSection {
  heading: string;
  paragraphs?: readonly string[];
  /** A short list under the paragraphs. */
  items?: readonly string[];
  /** A link out, such as the university's own site. */
  link?: { label: string; href: string };
}

export interface SiteArticle {
  title: string;
  /** One or two sentences under the title that say what the page is. */
  lead: string;
  /** Shown on pages people may need to cite, as "last updated". */
  updated?: string;
  sections: readonly SiteSection[];
}

export type SiteContent = Record<SitePageId, SiteArticle>;
