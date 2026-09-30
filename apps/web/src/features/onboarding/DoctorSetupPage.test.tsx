import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiError, nth, queueResponses, renderWithProviders, sessionUser } from '../../test/render';
import { DoctorSetupPage } from './DoctorSetupPage';

const dashboard = { '/app': <p>dashboard</p> };

async function fillDetails(accessCode = 'faculty-code') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/Doctor verification code/), accessCode);
  await user.type(screen.getByLabelText(/Staff ID/), 'ACU-1042');
  await user.type(screen.getByLabelText(/Name shown to your students/), 'Dr. Mona Adel');
  await user.type(screen.getByLabelText(/University email/), 'mona.adel@acu.edu.eg');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  return user;
}

describe('DoctorSetupPage details step', () => {
  it('checks the fields before sending anything', async () => {
    const user = userEvent.setup();
    const { fetchMock, calls } = queueResponses();
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<DoctorSetupPage user={sessionUser()} />, { route: '/welcome/doctor' });

    await user.type(screen.getByLabelText(/University email/), 'mona@gmail.com');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(calls).toHaveLength(0);
    expect(screen.getByLabelText(/University email/)).toHaveAccessibleDescription(
      /Use your university email ending in @acu.edu.eg/,
    );
    expect(screen.getByLabelText(/Doctor verification code/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('explains a wrong doctor code next to the field, with the attempts left', async () => {
    const { fetchMock } = queueResponses([
      403,
      apiError('INVALID_DOCTOR_CODE', { details: { attemptsLeft: 3 } }),
    ]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<DoctorSetupPage user={sessionUser()} />, { route: '/welcome/doctor' });

    await fillDetails('I AM A DOCTOR');

    const field = screen.getByLabelText(/Doctor verification code/);
    expect(field).toHaveAccessibleDescription(/The doctor verification code is not correct/);
    expect(field).toHaveAccessibleDescription(/Attempts left: 3/);
  });

  it('marks a staff ID that belongs to someone else', async () => {
    const { fetchMock } = queueResponses([409, apiError('STAFF_ID_TAKEN')]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<DoctorSetupPage user={sessionUser()} />, { route: '/welcome/doctor' });

    await fillDetails();

    expect(screen.getByLabelText(/Staff ID/)).toHaveAccessibleDescription(
      /already registered to another account/,
    );
  });

  it('prefills the university email when the person signed in with it', () => {
    renderWithProviders(<DoctorSetupPage user={sessionUser({ email: 'mona@acu.edu.eg' })} />, {
      route: '/welcome/doctor',
    });

    expect(screen.getByLabelText(/University email/)).toHaveValue('mona@acu.edu.eg');
  });
});

describe('DoctorSetupPage email step', () => {
  it('asks for the emailed code and confirms it as soon as it is complete', async () => {
    const { fetchMock, calls } = queueResponses(
      [
        200,
        { status: 'verification_sent', sentTo: 'm•••••@acu.edu.eg', resendAvailableInSeconds: 60 },
      ],
      [
        200,
        {
          user: sessionUser({
            role: 'doctor',
            doctor: {
              status: 'active',
              displayName: 'Dr. Mona Adel',
              staffId: 'ACU-1042',
              universityEmail: 'mona.adel@acu.edu.eg',
            },
          }),
        },
      ],
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<DoctorSetupPage user={sessionUser()} />, {
      route: '/welcome/doctor',
      extraRoutes: dashboard,
    });

    const user = await fillDetails();
    expect(
      // The address is wrapped in Unicode isolate marks so Arabic text cannot reorder it.
      await screen.findByText(/We sent a 6-digit code to ⁦m•••••@acu\.edu\.eg⁩/),
    ).toBeInTheDocument();
    expect(screen.getByText(/You can ask for a new code in 60 seconds/)).toBeInTheDocument();

    await user.keyboard('042917');

    expect(await screen.findByText('dashboard')).toBeInTheDocument();
    expect(calls[1]?.url).toBe('/api/onboarding/doctor/verify');
    const sentBody = calls[1]?.init?.body;
    expect(typeof sentBody).toBe('string');
    expect(JSON.parse(sentBody as string)).toEqual({ code: '042917' });
  });

  it('opens on the code step for a doctor who already received a code', () => {
    renderWithProviders(
      <DoctorSetupPage
        user={sessionUser({
          doctor: {
            status: 'pending_verification',
            displayName: 'Dr. Mona',
            staffId: 'ACU-1',
            universityEmail: 'mona@acu.edu.eg',
          },
        })}
      />,
      { route: '/welcome/doctor' },
    );

    expect(
      screen.getByRole('heading', { name: 'Confirm your university email' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/m•••@acu.edu.eg/)).toBeInTheDocument();
  });

  it('clears a wrong code and says how many tries are left', async () => {
    const user = userEvent.setup();
    const { fetchMock } = queueResponses([
      400,
      apiError('INVALID_EMAIL_CODE', { details: { attemptsLeft: 4 } }),
    ]);
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(
      <DoctorSetupPage
        user={sessionUser({
          doctor: {
            status: 'pending_verification',
            displayName: 'Dr. Mona',
            staffId: 'ACU-1',
            universityEmail: 'mona@acu.edu.eg',
          },
        })}
      />,
      { route: '/welcome/doctor' },
    );

    await user.click(nth(screen.getAllByRole('textbox'), 0));
    await user.keyboard('111111');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That code is not correct. Attempts left: 4',
    );
    expect(
      screen.getAllByRole('textbox').every((box) => (box as HTMLInputElement).value === ''),
    ).toBe(true);
  });
});
