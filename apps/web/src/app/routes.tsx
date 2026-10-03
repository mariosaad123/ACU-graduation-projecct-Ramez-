import type { SessionUser, UserRole } from '@acu/shared';
import type { ReactNode } from 'react';
import type { RouteObject } from 'react-router';
import { SplashScreen } from '../components/brand/SplashScreen';
import { AppLayout } from '../components/layout/AppLayout';
import { PRIMARY_NAV } from '../components/layout/nav-items';
import { AuthGate } from '../features/auth/AuthGate';
import { NotFoundPage } from '../pages/NotFoundPage';
import { RouteErrorPage } from '../pages/RouteErrorPage';

type Render = (user: SessionUser | null) => ReactNode;
type GateRule = Parameters<typeof AuthGate>[0]['rule'];

const MEMBERS: readonly UserRole[] = ['student', 'doctor', 'admin'];
const signedIn = (roles: readonly UserRole[] = MEMBERS): GateRule => ({ kind: 'role', roles });

/**
 * A page behind the auth gate whose code is fetched when it is first visited. The gate itself is
 * part of the first download, so who may see a page is decided before its code is even asked for.
 */
function gated(rule: GateRule, load: () => Promise<Render>): Pick<RouteObject, 'lazy'> {
  return {
    lazy: async () => {
      const render = await load();
      return { Component: () => <AuthGate rule={rule}>{render}</AuthGate> };
    },
  };
}

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    // Shown while the first page's code is on its way: the same screen index.html starts with.
    HydrateFallback: SplashScreen,
    children: [
      {
        // Page errors render inside the layout, so the header and footer stay usable.
        errorElement: <RouteErrorPage />,
        children: [
          {
            index: true,
            lazy: async () => ({ Component: (await import('../pages/HomePage')).HomePage }),
          },
          {
            path: 'sign-in',
            ...gated({ kind: 'visitor' }, async () => {
              const { SignInPage } = await import('../features/auth/SignInPage');
              return () => <SignInPage />;
            }),
          },
          {
            path: 'welcome',
            ...gated({ kind: 'setup' }, async () => {
              const { WelcomePage } = await import('../features/onboarding/WelcomePage');
              return (user) => user && <WelcomePage user={user} />;
            }),
          },
          {
            path: 'welcome/student',
            ...gated({ kind: 'setup' }, async () => {
              const { StudentSetupPage } = await import('../features/onboarding/StudentSetupPage');
              return () => <StudentSetupPage />;
            }),
          },
          {
            path: 'welcome/doctor',
            ...gated({ kind: 'setup' }, async () => {
              const { DoctorSetupPage } = await import('../features/onboarding/DoctorSetupPage');
              return (user) => user && <DoctorSetupPage user={user} />;
            }),
          },
          {
            path: 'app',
            ...gated(signedIn(), async () => {
              const { DashboardPage } = await import('../features/dashboard/DashboardPage');
              return (user) => user && <DashboardPage user={user} />;
            }),
          },
          {
            path: 'app/profile',
            ...gated(signedIn(), async () => {
              const { ProfilePage } = await import('../features/profile/ProfilePage');
              return (user) => user && <ProfilePage user={user} />;
            }),
          },
          {
            path: 'app/groups/:groupId',
            ...gated(signedIn(['doctor', 'student']), async () => {
              // One download for both: a doctor's page falls back to the member's for a group
              // they assist in.
              const { GroupPage } = await import('../features/groups/GroupPage');
              const { MemberGroupPage } = await import('../features/groups/MemberGroupPage');
              return (user) => (user?.role === 'doctor' ? <GroupPage /> : <MemberGroupPage />);
            }),
          },
          {
            path: 'app/notifications',
            ...gated(signedIn(), async () => {
              const { NotificationsPage } =
                await import('../features/notifications/NotificationsPage');
              return () => <NotificationsPage />;
            }),
          },
          {
            path: 'app/people/:personId',
            ...gated(signedIn(['doctor', 'student']), async () => {
              const { PersonPage } = await import('../features/people/PersonPage');
              return () => <PersonPage />;
            }),
          },
          {
            // Open to everyone: the page itself explains what a visitor must do before joining.
            path: 'join/:code',
            lazy: async () => ({
              Component: (await import('../features/groups/JoinPage')).JoinPage,
            }),
          },
          {
            path: 'design-system',
            lazy: async () => {
              const { DesignSystemPage } = await import('../pages/design-system/DesignSystemPage');
              return { Component: DesignSystemPage };
            },
          },
          ...(['about', 'privacy', 'terms', 'credits', 'contact'] as const).map((page) => ({
            path: page,
            lazy: async () => {
              const { SitePage } = await import('../features/site/SitePage');
              return { Component: () => <SitePage page={page} /> };
            },
          })),
          ...PRIMARY_NAV.map((section) => ({
            path: section.to.slice(1),
            lazy: async () => {
              const { PlannedSectionPage } = await import('../pages/PlannedSectionPage');
              return { Component: () => <PlannedSectionPage labelKey={section.labelKey} /> };
            },
          })),
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
