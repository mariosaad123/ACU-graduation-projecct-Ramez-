import type { RouteObject } from 'react-router';
import { AppLayout } from '../components/layout/AppLayout';
import { FOOTER_NAV, PRIMARY_NAV } from '../components/layout/nav-items';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PlannedSectionPage } from '../pages/PlannedSectionPage';
import { RouteErrorPage } from '../pages/RouteErrorPage';

const plannedSections = [
  ...PRIMARY_NAV,
  ...FOOTER_NAV.filter((item) => item.to !== '/design-system'),
  { to: '/sign-in', labelKey: 'nav.signIn' },
] as const;

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        // Page errors render inside the layout, so the header and footer stay usable.
        errorElement: <RouteErrorPage />,
        children: [
          { index: true, element: <HomePage /> },
          {
            path: 'design-system',
            lazy: async () => {
              const { DesignSystemPage } = await import('../pages/design-system/DesignSystemPage');
              return { Component: DesignSystemPage };
            },
          },
          ...plannedSections.map((section) => ({
            path: section.to.slice(1),
            element: <PlannedSectionPage labelKey={section.labelKey} />,
          })),
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
