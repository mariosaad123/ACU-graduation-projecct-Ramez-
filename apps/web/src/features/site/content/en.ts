import type { SiteContent } from './types';

const UPDATED = '2026-10-03';

export const en: SiteContent = {
  about: {
    title: 'About the platform',
    lead: 'ACU Languages is one place where students of the Faculty of Languages and Translation learn, and where their doctors follow them.',
    sections: [
      {
        heading: 'What it offers',
        paragraphs: [
          'You find your level in a language, then practise listening, speaking, reading and writing at that level.',
          'Every course has its group: a chat, announcements, assignments, and a gradebook in which each student sees only what is theirs.',
        ],
      },
      {
        heading: 'Seven languages',
        paragraphs: [
          'The platform teaches seven languages, and you can learn more than one at a time:',
        ],
        items: ['Arabic', 'English', 'French', 'German', 'Spanish', 'Chinese', 'Japanese'],
      },
      {
        heading: 'The Faculty of Languages and Translation',
        paragraphs: [
          'The Faculty of Languages and Translation at Ahram Canadian University was founded in 2019 to prepare graduates who master the world’s languages and work with them in translation and across cultures.',
          'It pairs the study of a language and its literature with practical training in using it; this platform carries that beyond the lecture hall.',
        ],
        link: { label: 'Ahram Canadian University website', href: 'https://acu.edu.eg/en/' },
      },
    ],
  },

  privacy: {
    title: 'Privacy policy',
    lead: 'What we know about you, why, and who sees it. Kept short so that it gets read.',
    updated: UPDATED,
    sections: [
      {
        heading: 'What we keep',
        items: [
          'From your Google account: your name, email and photo. We never see or store your password.',
          'What you enter: your university ID, the languages you learn and your goal; for a doctor, the staff ID and university email.',
          'What you do in your groups: messages, files, handed-in assignments and grades, and when you were last seen in a group.',
          'A security log: sign-in times and the internet address, to protect accounts from misuse.',
        ],
      },
      {
        heading: 'Who sees what',
        items: [
          'Your classmates in a group see your name, your photo and your messages in the chat.',
          'Your doctor and their assistants see your email, university ID, grades, activity and the work you hand in.',
          'No other student sees your grades or your assignments.',
          'We do not sell your data or share it outside the university. There are no adverts and no trackers.',
        ],
      },
      {
        heading: 'Cookies',
        paragraphs: [
          'We use one necessary cookie that keeps you signed in. Other pages cannot read it, and we use no tracking cookies.',
        ],
      },
      {
        heading: 'How we protect it',
        items: [
          'The connection to the platform is always encrypted.',
          'Photos you upload are stripped of hidden data such as where they were taken.',
          'A file opens only for people who are allowed to see it.',
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          'You can correct your details in your profile at any time. To ask for a copy of your data or to delete your account, contact the faculty office; grades recorded by your doctors remain part of your academic record.',
        ],
      },
    ],
  },

  terms: {
    title: 'Terms of use',
    lead: 'A few rules that keep the platform a comfortable place to study for everyone.',
    updated: UPDATED,
    sections: [
      {
        heading: 'Who may use it',
        paragraphs: [
          'The platform is for students and teaching staff of the Faculty of Languages and Translation at Ahram Canadian University. Your account is personal: do not share it, and enter your real details, your university ID above all.',
        ],
      },
      {
        heading: 'What we expect of you',
        items: [
          'Respect in conversations with your classmates and doctors.',
          'That the work you hand in is your own.',
          'Not to upload files you have no right to share, or harmful ones.',
          'Not to try to reach other people’s data or disrupt the platform.',
        ],
      },
      {
        heading: 'Content and grades',
        paragraphs: [
          'What you write and upload stays yours; you allow it to be shown to your group and your doctors as far as studying requires. Grades are set by the doctor, who is the authority on them; the platform shows them as recorded.',
        ],
      },
      {
        heading: 'Suspension',
        paragraphs: [
          'A doctor or the faculty office may suspend an account that breaks these terms, and gives the reason. If you believe a suspension is a mistake, contact your doctor or the faculty office.',
        ],
      },
      {
        heading: 'Availability',
        paragraphs: [
          'We work to keep the platform available at all times; it may pause briefly for maintenance or updates. These terms may change as new sections are added, and the date of the last update is shown at the top.',
        ],
      },
    ],
  },

  credits: {
    title: 'Credits and licences',
    lead: 'The platform is built on open-source software and fonts. We thank their authors and list them here with their licences.',
    sections: [
      {
        heading: 'Interface',
        items: [
          'React, React Router and TanStack Query — MIT licence',
          'i18next and react-i18next — MIT licence',
          'Phosphor Icons — MIT licence',
          'frimousse and Emojibase data for the emoji list — MIT licence',
          'uqr for QR codes — MIT licence',
          'Vite — MIT licence',
        ],
      },
      {
        heading: 'Server',
        items: [
          'Node.js and Express — MIT licence',
          'PostgreSQL and PGlite — PostgreSQL and Apache 2.0 licences',
          'Drizzle ORM — Apache 2.0 licence',
          'ExcelJS for Excel files — MIT licence',
          'sharp for image processing — Apache 2.0 licence',
          'Zod for data validation — MIT licence',
        ],
      },
      {
        heading: 'Fonts',
        items: [
          'Alexandria — SIL Open Font Licence 1.1',
          'IBM Plex Sans Arabic — SIL Open Font Licence 1.1',
          'Noto Sans SC and Noto Sans JP — SIL Open Font Licence 1.1',
        ],
      },
    ],
  },

  contact: {
    title: 'Contact',
    lead: 'The shortest way to an answer starts with the person closest to the problem.',
    sections: [
      {
        heading: 'A question about a course, a grade or an assignment',
        paragraphs: [
          'Write to your doctor or teaching assistant in your group’s chat: they are the ones with the answer.',
        ],
      },
      {
        heading: 'A problem with your account',
        paragraphs: [
          'If your account is suspended, your university ID is on another account, or you are a doctor without the staff code, contact the office of the Faculty of Languages and Translation.',
        ],
        link: { label: 'Ahram Canadian University website', href: 'https://acu.edu.eg/en/' },
      },
      {
        heading: 'Something broken on the platform',
        paragraphs: [
          'Tell your doctor what happened and what you were doing at the time, with a screenshot if you can; it helps us fix it quickly.',
        ],
      },
    ],
  },
};
