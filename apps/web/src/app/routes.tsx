import type { RouteObject } from 'react-router';
import { AppLayout } from '../components/layout/AppLayout';
import { FOOTER_NAV, PRIMARY_NAV } from '../components/layout/nav-items';
import { AuthGate } from '../features/auth/AuthGate';
import { SignInPage } from '../features/auth/SignInPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { GroupPage } from '../features/groups/GroupPage';
import { JoinPage } from '../features/groups/JoinPage';
import { DoctorSetupPage } from '../features/onboarding/DoctorSetupPage';
import { StudentSetupPage } from '../features/onboarding/StudentSetupPage';
import { WelcomePage } from '../features/onboarding/WelcomePage';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PlannedSectionPage } from '../pages/PlannedSectionPage';
import { RouteErrorPage } from '../pages/RouteErrorPage';

const plannedSections = [
  ...PRIMARY_NAV,
  ...FOOTER_NAV.filter((item) => item.to !== '/design-system'),
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
            path: 'sign-in',
            element: <AuthGate rule={{ kind: 'visitor' }}>{() => <SignInPage />}</AuthGate>,
          },
          {
            path: 'welcome',
            element: (
              <AuthGate rule={{ kind: 'setup' }}>
                {(user) => user && <WelcomePage user={user} />}
              </AuthGate>
            ),
          },
          {
            path: 'welcome/student',
            element: <AuthGate rule={{ kind: 'setup' }}>{() => <StudentSetupPage />}</AuthGate>,
          },
          {
            path: 'welcome/doctor',
            element: (
              <AuthGate rule={{ kind: 'setup' }}>
                {(user) => user && <DoctorSetupPage user={user} />}
              </AuthGate>
            ),
          },
          {
            path: 'app',
            element: (
              <AuthGate rule={{ kind: 'role', roles: ['student', 'doctor', 'admin'] }}>
                {(user) => user && <DashboardPage user={user} />}
              </AuthGate>
            ),
          },
          {
            path: 'app/groups/:groupId',
            element: (
              <AuthGate rule={{ kind: 'role', roles: ['doctor'] }}>{() => <GroupPage />}</AuthGate>
            ),
          },
          // Open to everyone: the page itself explains what a visitor must do before joining.
          { path: 'join/:code', element: <JoinPage /> },
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
