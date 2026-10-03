export const PRIMARY_NAV = [
  { to: '/placement', labelKey: 'nav.placement' },
  { to: '/skills', labelKey: 'nav.skills' },
  { to: '/translation', labelKey: 'nav.translation' },
  { to: '/practice', labelKey: 'nav.practice' },
  { to: '/library', labelKey: 'nav.library' },
  { to: '/exams', labelKey: 'nav.exams' },
] as const;

export const FOOTER_NAV = [
  { to: '/about', labelKey: 'footer.about' },
  { to: '/privacy', labelKey: 'footer.privacy' },
  { to: '/terms', labelKey: 'footer.terms' },
  { to: '/contact', labelKey: 'footer.contact' },
  { to: '/credits', labelKey: 'footer.credits' },
  { to: '/design-system', labelKey: 'footer.designSystem' },
] as const;
