import type { Messages } from './types';

export const en: Messages = {
  brand: {
    name: 'ACU Languages',
    shortName: 'ACU Languages',
    faculty: 'Faculty of Languages and Translation',
    university: 'Ahram Canadian University',
    homeLink: 'ACU Languages home page',
  },
  nav: {
    label: 'Main navigation',
    placement: 'Placement test',
    skills: 'Skills',
    translation: 'Translation',
    practice: 'Practice',
    library: 'Library',
    exams: 'Exams',
    signIn: 'Sign in',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    skipToContent: 'Skip to content',
  },
  locale: {
    switchTo: 'العربية',
    switchToLabel: 'التبديل إلى الواجهة العربية',
  },
  skills: {
    listening: 'Listening',
    speaking: 'Speaking',
    reading: 'Reading',
    writing: 'Writing',
  },
  footer: {
    navLabel: 'Site links',
    about: 'About',
    privacy: 'Privacy policy',
    terms: 'Terms of use',
    contact: 'Contact us',
    designSystem: 'Design system',
    rights: '© {{year}} Ahram Canadian University. All rights reserved.',
    universityLogo: 'Ahram Canadian University logo',
    facultyLogo: 'Faculty of Languages and Translation logo',
  },
  common: {
    close: 'Close',
    cancel: 'Cancel',
    confirm: 'Confirm',
    loading: 'Loading…',
    optional: 'Optional',
    required: 'Required',
    backHome: 'Back to home',
  },
  status: {
    checking: 'Checking the connection to the server…',
    online: 'Server connected',
    offline: 'Cannot reach the server',
  },
  pages: {
    home: {
      eyebrow: 'Faculty of Languages and Translation',
      title: 'Learn six languages at the level that suits you',
      lead: 'Start with a placement test, then practise listening, speaking, reading and writing one step at a time.',
      start: 'Take the placement test',
      explore: 'Explore the skills',
    },
    placeholder: {
      title: 'This section is under construction',
      body: 'We are building “{{section}}” right now. It will be available soon.',
    },
    notFound: {
      title: 'Page not found',
      body: 'The link may have changed or the page may have been removed.',
    },
    error: {
      title: 'Something went wrong',
      body: 'Sorry about that. Reload the page, and if the problem continues, try again later.',
      reload: 'Reload the page',
    },
  },
  languagePicker: {
    label: 'Choose a language to learn',
    selected: 'Selected language: {{language}}',
  },
  audio: {
    play: 'Play',
    pause: 'Pause',
    seek: 'Playback position',
    speed: 'Playback speed',
    playsLeft: 'Plays remaining: {{count}}',
    noPlaysLeft: 'You have used all the allowed plays',
    loadError: 'The audio file could not be loaded',
  },
  recorder: {
    start: 'Start recording',
    stop: 'Stop recording',
    retake: 'Record again',
    requesting: 'Waiting for microphone permission…',
    recording: 'Recording',
    level: 'Input level',
    limit: 'Up to {{seconds}} seconds',
    recorded: 'Recording ready',
    errors: {
      permissionDenied:
        'Microphone access was blocked. Allow it in your browser settings and try again.',
      noMicrophone: 'No microphone was found on this device.',
      unsupported:
        'Your browser does not support audio recording. Try the latest Chrome, Edge or Safari.',
      insecureContext: 'Audio recording needs a secure (HTTPS) connection.',
      unknown: 'Something went wrong while recording. Please try again.',
    },
  },
  toast: {
    region: 'Notifications',
    dismiss: 'Dismiss notification',
  },
};
