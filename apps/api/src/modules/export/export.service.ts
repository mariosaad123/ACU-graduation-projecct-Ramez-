import {
  bandOf,
  totalPercent,
  type GradeBand,
  type GradeColumnKind,
  type Gradebook,
  type GroupRole,
} from '@acu/shared';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import type { Database } from '../../db/client';
import {
  announcementReads,
  announcements,
  assignments,
  doctorProfiles,
  groupAssistants,
  groupMembers,
  groupMessages,
  groups,
  pollOptions,
  polls,
  pollVotes,
  submissions,
  type Group,
  type User,
} from '../../db/schema';
import { recordAudit } from '../audit/audit';
import { namesOf } from '../chat/messages';
import { assertCan, groupAccess } from '../groups/access';
import { loadGradebook } from '../gradebook/gradebook.service';

export const EXPORT_REPORTS = ['grades', 'full', 'activity'] as const;
export type ExportReport = (typeof EXPORT_REPORTS)[number];
export type ExportLocale = 'ar' | 'en';

/** The platform's colours, so the workbook looks like it came from the same place. */
const COLOR = {
  navy: 'FF0B2A5F',
  blue: 'FF174593',
  blueSoft: 'FFEEF3FB',
  blueLine: 'FFD9E4F5',
  orange: 'FFF95A00',
  orangeSoft: 'FFFFF3EB',
  green: 'FF1D6134',
  greenSoft: 'FFEAF6EC',
  amber: 'FF7A5608',
  amberSoft: 'FFFDF5E1',
  red: 'FF971D29',
  redSoft: 'FFFDECEC',
  gray: 'FF4F5868',
  graySoft: 'FFF7F8FA',
  line: 'FFDDE1E8',
  white: 'FFFFFFFF',
};

const BAND_COLORS: Record<GradeBand, { fg: string; bg: string }> = {
  excellent: { fg: COLOR.green, bg: COLOR.greenSoft },
  veryGood: { fg: COLOR.blue, bg: COLOR.blueSoft },
  good: { fg: COLOR.navy, bg: COLOR.blueLine },
  pass: { fg: COLOR.amber, bg: COLOR.amberSoft },
  fail: { fg: COLOR.red, bg: COLOR.redSoft },
};

const TEXT = {
  ar: {
    font: 'Arial',
    summary: 'ملخص',
    grades: 'كشف الدرجات',
    activity: 'النشاط',
    announcements: 'الإعلانات',
    polls: 'الاستطلاعات',
    members: 'الأعضاء',
    overview: 'كل المجموعات',
    reportTitle: { grades: 'كشف الدرجات الرسمي', full: 'التقرير الشامل', activity: 'تقرير النشاط' },
    group: 'المجموعة',
    language: 'اللغة',
    doctor: 'الدكتور',
    assistants: 'مساعدو التدريس',
    students: 'الطلاب',
    generated: 'تاريخ الإصدار',
    platform: 'منصة ACU للغات — كلية اللغات والترجمة، جامعة الأهرام الكندية',
    number: 'م',
    name: 'الاسم',
    universityId: 'الرقم الجامعي',
    email: 'البريد',
    total: 'المجموع %',
    band: 'التقدير',
    status: 'الحالة',
    outOf: (max: number) => `من ${String(max)}`,
    weight: (weight: number) => `وزن ${String(weight)}%`,
    average: 'المتوسط',
    highest: 'الأعلى',
    lowest: 'الأدنى',
    absent: 'غ',
    excused: 'ع',
    legend: 'غ = غائب · ع = معذور · الخانة الفارغة لم تُرصد بعد',
    signature: 'توقيع الدكتور',
    stamp: 'ختم الكلية',
    bands: {
      excellent: 'ممتاز',
      veryGood: 'جيد جدًا',
      good: 'جيد',
      pass: 'مقبول',
      fail: 'راسب',
    } satisfies Record<GradeBand, string>,
    statuses: {
      active: 'في المجموعة',
      left: 'غادر',
      removed: 'أُزيل',
      pending: 'بانتظار الموافقة',
    },
    kinds: {
      quiz: 'كويز',
      assignment: 'واجب',
      midterm: 'ميدترم',
      final: 'فاينال',
      oral: 'شفوي',
      participation: 'مشاركة',
      project: 'مشروع',
      other: 'أخرى',
    } satisfies Record<GradeColumnKind, string>,
    roles: {
      owner: 'الدكتور',
      assistant: 'مساعد تدريس',
      moderator: 'مشرف',
      representative: 'مندوب',
      student: 'طالب',
    } satisfies Record<GroupRole, string>,
    kpis: {
      classAverage: 'متوسط الدفعة',
      passRate: 'نسبة النجاح',
      bands: 'توزيع التقديرات',
      activeThisWeek: 'نشطون هذا الأسبوع',
      quiet: 'صامتون (بلا رسائل 7 أيام)',
      away: 'غائبون (لم يفتحوا 7 أيام)',
      announcementsRead: 'متوسط قراءة الإعلانات',
      pollsAnswered: 'متوسط المشاركة في الاستطلاعات',
    },
    activityHeaders: [
      'الرسائل',
      'هذا الأسبوع',
      'آخر رسالة',
      'آخر ظهور',
      'الإعلانات المقروءة',
      'الاستطلاعات',
      'الملفات',
      'ملاحظة',
    ],
    quietFlag: 'صامت',
    awayFlag: 'غائب',
    activeFlag: 'نشط',
    announcementHeaders: [
      'العنوان',
      'التاريخ',
      'الكاتب',
      'مهم',
      'قرأه',
      'من',
      'النسبة',
      'لم يقرأه',
    ],
    yes: 'نعم',
    pollHeaders: ['السؤال', 'التاريخ', 'الكاتب', 'شارك', 'من', 'النتائج', 'الحالة'],
    pollClosed: 'مغلق',
    pollOpen: 'مفتوح',
    memberHeaders: ['الاسم', 'الدور', 'الحالة', 'انضم', 'البريد', 'الرقم الجامعي'],
    assignments: 'الواجبات',
    assignmentHeaders: ['م', 'الاسم', 'الرقم الجامعي'],
    handedIn: 'سلّم',
    handedInLate: 'سلّم متأخرًا',
    notHandedIn: 'لم يسلّم',
    due: 'الموعد',
    noDue: 'بلا موعد',
    handedInCount: 'عدد من سلّموا',
    assignmentsNote: 'درجات الواجبات في ورقة كشف الدرجات، كل واجب في عموده.',
    noAssignments: 'لم تُنشأ واجبات بعد.',
    overviewHeaders: ['المجموعة', 'اللغة', 'الطلاب', 'متوسط الدفعة %', 'نسبة النجاح %', 'الحالة'],
    archived: 'مؤرشفة',
    running: 'جارية',
    noColumns: 'لم تُضف أعمدة درجات بعد.',
  },
  en: {
    font: 'Arial',
    summary: 'Summary',
    grades: 'Grade sheet',
    activity: 'Activity',
    announcements: 'Announcements',
    polls: 'Polls',
    members: 'Members',
    overview: 'All groups',
    reportTitle: {
      grades: 'Official grade sheet',
      full: 'Full report',
      activity: 'Activity report',
    },
    group: 'Group',
    language: 'Language',
    doctor: 'Doctor',
    assistants: 'Teaching assistants',
    students: 'Students',
    generated: 'Generated',
    platform: 'ACU Languages — Faculty of Languages and Translation, Ahram Canadian University',
    number: '#',
    name: 'Name',
    universityId: 'University ID',
    email: 'Email',
    total: 'Total %',
    band: 'Grade',
    status: 'Status',
    outOf: (max: number) => `out of ${String(max)}`,
    weight: (weight: number) => `weight ${String(weight)}%`,
    average: 'Average',
    highest: 'Highest',
    lowest: 'Lowest',
    absent: 'A',
    excused: 'E',
    legend: 'A = absent · E = excused · an empty cell is not recorded yet',
    signature: "Doctor's signature",
    stamp: 'Faculty stamp',
    bands: {
      excellent: 'Excellent',
      veryGood: 'Very good',
      good: 'Good',
      pass: 'Pass',
      fail: 'Fail',
    } satisfies Record<GradeBand, string>,
    statuses: { active: 'In the group', left: 'Left', removed: 'Removed', pending: 'Waiting' },
    kinds: {
      quiz: 'Quiz',
      assignment: 'Assignment',
      midterm: 'Midterm',
      final: 'Final',
      oral: 'Oral',
      participation: 'Participation',
      project: 'Project',
      other: 'Other',
    } satisfies Record<GradeColumnKind, string>,
    roles: {
      owner: 'Doctor',
      assistant: 'Teaching assistant',
      moderator: 'Moderator',
      representative: 'Representative',
      student: 'Student',
    } satisfies Record<GroupRole, string>,
    kpis: {
      classAverage: 'Class average',
      passRate: 'Pass rate',
      bands: 'Grade distribution',
      activeThisWeek: 'Active this week',
      quiet: 'Quiet (no message in 7 days)',
      away: 'Away (not opened in 7 days)',
      announcementsRead: 'Announcements read, on average',
      pollsAnswered: 'Poll participation, on average',
    },
    activityHeaders: [
      'Messages',
      'This week',
      'Last message',
      'Last seen',
      'Announcements read',
      'Polls',
      'Files',
      'Note',
    ],
    quietFlag: 'Quiet',
    awayFlag: 'Away',
    activeFlag: 'Active',
    announcementHeaders: ['Title', 'Date', 'Author', 'Important', 'Read', 'Of', 'Rate', 'Not read'],
    yes: 'Yes',
    pollHeaders: ['Question', 'Date', 'Author', 'Voted', 'Of', 'Results', 'State'],
    pollClosed: 'Closed',
    pollOpen: 'Open',
    memberHeaders: ['Name', 'Role', 'Status', 'Joined', 'Email', 'University ID'],
    assignments: 'Assignments',
    assignmentHeaders: ['#', 'Name', 'University ID'],
    handedIn: 'Handed in',
    handedInLate: 'Handed in late',
    notHandedIn: 'Not handed in',
    due: 'Due',
    noDue: 'No deadline',
    handedInCount: 'Handed in',
    assignmentsNote: 'Assignment scores are on the grade sheet, one column each.',
    noAssignments: 'No assignments yet.',
    overviewHeaders: ['Group', 'Language', 'Students', 'Class average %', 'Pass rate %', 'State'],
    archived: 'Archived',
    running: 'Running',
    noColumns: 'No grade columns yet.',
  },
};
type Text = (typeof TEXT)[ExportLocale];

const LANGUAGE_NAMES: Record<ExportLocale, Record<string, string>> = {
  ar: {
    ar: 'العربية',
    en: 'الإنجليزية',
    fr: 'الفرنسية',
    de: 'الألمانية',
    es: 'الإسبانية',
    zh: 'الصينية',
    ja: 'اليابانية',
  },
  en: {
    ar: 'Arabic',
    en: 'English',
    fr: 'French',
    de: 'German',
    es: 'Spanish',
    zh: 'Chinese',
    ja: 'Japanese',
  },
};

const thin = { style: 'thin' as const, color: { argb: COLOR.line } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

function solid(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

/** A new sheet in the right reading direction, ready to print on A4 across the page. */
function addSheet(
  book: ExcelJS.Workbook,
  name: string,
  locale: ExportLocale,
  frozen?: { x: number; y: number },
) {
  // Excel limits sheet names to 31 characters without []:*?/\.
  const safe = name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);
  const sheet = book.addWorksheet(safe, {
    views: [
      {
        rightToLeft: locale === 'ar',
        state: frozen ? 'frozen' : 'normal',
        xSplit: frozen?.x ?? 0,
        ySplit: frozen?.y ?? 0,
        showGridLines: false,
      },
    ],
    pageSetup: {
      // A4. The library's enum is ambient and cannot be imported as a value.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-assignment
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
    headerFooter: { oddFooter: '&L&D&R&P / &N' },
  });
  return sheet;
}

/** A coloured banner across the top of a sheet: the report's name and the group's. */
function banner(
  sheet: ExcelJS.Worksheet,
  width: number,
  title: string,
  subtitle: string,
  text: Text,
) {
  sheet.mergeCells(1, 1, 1, Math.max(width, 2));
  const head = sheet.getCell(1, 1);
  head.value = title;
  head.font = { name: text.font, size: 16, bold: true, color: { argb: COLOR.white } };
  head.fill = solid(COLOR.navy);
  head.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 30;

  sheet.mergeCells(2, 1, 2, Math.max(width, 2));
  const sub = sheet.getCell(2, 1);
  sub.value = subtitle;
  sub.font = { name: text.font, size: 11, color: { argb: COLOR.navy } };
  sub.fill = solid(COLOR.orangeSoft);
  sub.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(2).height = 20;
  // An orange rule under the banner, the platform's mark.
  for (let column = 1; column <= Math.max(width, 2); column += 1) {
    sheet.getCell(2, column).border = {
      bottom: { style: 'medium', color: { argb: COLOR.orange } },
    };
  }
}

function headerRow(sheet: ExcelJS.Worksheet, rowNumber: number, values: string[], text: Text) {
  const row = sheet.getRow(rowNumber);
  values.forEach((value, index) => {
    const cell = row.getCell(index + 1);
    cell.value = value;
    cell.font = { name: text.font, bold: true, color: { argb: COLOR.white } };
    cell.fill = solid(COLOR.blue);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = BORDER;
  });
  row.height = 50;
}

function bodyCell(cell: ExcelJS.Cell, text: Text, zebra: boolean) {
  cell.font = { name: text.font, size: 11, ...cell.font };
  cell.border = BORDER;
  if (zebra && cell.style.fill === undefined) {
    cell.fill = solid(COLOR.graySoft);
  }
  cell.alignment = { vertical: 'middle', ...cell.alignment };
}

/** Dates in words of the report's language, always with Western digits like the rest of it. */
function dateText(date: Date, locale: ExportLocale, withTime = false): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', {
    dateStyle: 'long',
    timeStyle: withTime ? 'short' : undefined,
    timeZone: 'Africa/Cairo',
  }).format(date);
}

function dateCell(value: string | null): Date | string {
  return value ? new Date(value) : '';
}

interface GroupData {
  group: Group;
  doctorName: string;
  assistants: string[];
  gradebook: Gradebook;
  roles: Map<string, GroupRole>;
  announcements: {
    title: string;
    createdAt: Date;
    author: string;
    important: boolean;
    readers: Set<string>;
  }[];
  polls: {
    question: string;
    createdAt: Date;
    author: string;
    closed: boolean;
    voters: number;
    options: { text: string; votes: number }[];
  }[];
  assignments: {
    title: string;
    dueAt: Date | null;
    /** When each student handed in, and whether that was late. */
    handedIn: Map<string, { at: Date; late: boolean }>;
  }[];
}

async function gatherGroup(db: Database, group: Group, now: Date): Promise<GroupData> {
  const [doctor] = await db
    .select({ name: doctorProfiles.displayName })
    .from(doctorProfiles)
    .where(eq(doctorProfiles.userId, group.doctorId));
  const assistantRows = await db
    .select({ name: doctorProfiles.displayName })
    .from(groupAssistants)
    .innerJoin(doctorProfiles, eq(doctorProfiles.userId, groupAssistants.userId))
    .where(eq(groupAssistants.groupId, group.id));
  const gradebook = await loadGradebook(db, group.id, now);
  const memberRoles = await db
    .select({ id: groupMembers.studentId, role: groupMembers.role })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, group.id));

  const announcementRows = await db
    .select()
    .from(announcements)
    .where(and(eq(announcements.groupId, group.id), isNull(announcements.deletedAt)))
    .orderBy(asc(announcements.createdAt));
  const readRows =
    announcementRows.length === 0
      ? []
      : await db
          .select()
          .from(announcementReads)
          .where(
            inArray(
              announcementReads.announcementId,
              announcementRows.map((row) => row.id),
            ),
          );

  const pollRows = await db
    .select({ poll: polls, authorId: groupMessages.authorId })
    .from(polls)
    .innerJoin(groupMessages, eq(groupMessages.id, polls.messageId))
    .where(and(eq(polls.groupId, group.id), isNull(groupMessages.deletedAt)))
    .orderBy(asc(polls.createdAt));
  const pollIds = pollRows.map((row) => row.poll.id);
  const [optionRows, voteRows] = await Promise.all([
    pollIds.length === 0
      ? []
      : db
          .select()
          .from(pollOptions)
          .where(inArray(pollOptions.pollId, pollIds))
          .orderBy(asc(pollOptions.position)),
    pollIds.length === 0
      ? []
      : db.select().from(pollVotes).where(inArray(pollVotes.pollId, pollIds)),
  ]);
  const authors = await namesOf(db, [
    ...new Set([
      ...announcementRows.map((row) => row.authorId),
      ...pollRows.map((row) => row.authorId),
    ]),
  ]);

  const assignmentRows = await db
    .select()
    .from(assignments)
    .where(eq(assignments.groupId, group.id))
    .orderBy(asc(assignments.createdAt));
  const submissionRows =
    assignmentRows.length === 0
      ? []
      : await db
          .select()
          .from(submissions)
          .where(
            inArray(
              submissions.assignmentId,
              assignmentRows.map((row) => row.id),
            ),
          );

  return {
    group,
    doctorName: doctor?.name ?? '',
    assistants: assistantRows.map((row) => row.name),
    gradebook,
    roles: new Map(memberRoles.map((row) => [row.id, row.role])),
    announcements: announcementRows.map((row) => ({
      title: row.title,
      createdAt: row.createdAt,
      author: authors.get(row.authorId)?.name ?? '',
      important: row.important,
      readers: new Set(
        readRows.filter((read) => read.announcementId === row.id).map((read) => read.userId),
      ),
    })),
    polls: pollRows.map(({ poll, authorId }) => {
      const votes = voteRows.filter((vote) => vote.pollId === poll.id);
      return {
        question: poll.question,
        createdAt: poll.createdAt,
        author: authors.get(authorId)?.name ?? '',
        closed: poll.closedAt !== null || (poll.closesAt !== null && poll.closesAt <= now),
        voters: new Set(votes.map((vote) => vote.userId)).size,
        options: optionRows
          .filter((option) => option.pollId === poll.id)
          .map((option) => ({
            text: option.text,
            votes: votes.filter((vote) => vote.optionId === option.id).length,
          })),
      };
    }),
    assignments: assignmentRows.map((row) => ({
      title: row.title,
      dueAt: row.dueAt,
      handedIn: new Map(
        submissionRows
          .filter((submission) => submission.assignmentId === row.id)
          .map((submission) => [
            submission.studentId,
            { at: submission.submittedAt, late: submission.late },
          ]),
      ),
    })),
  };
}

interface Standing {
  total: number | null;
}

function standings(data: GroupData): Map<string, Standing> {
  const { columns, grades } = data.gradebook;
  const result = new Map<string, Standing>();
  for (const student of data.gradebook.students) {
    const total = totalPercent(columns, (columnId) =>
      grades.find((grade) => grade.columnId === columnId && grade.studentId === student.id),
    );
    result.set(student.id, { total: total === null ? null : Math.round(total * 100) / 100 });
  }
  return result;
}

function gradesSheet(
  book: ExcelJS.Workbook,
  data: GroupData,
  text: Text,
  locale: ExportLocale,
  name: string,
  official: boolean,
) {
  const { columns, grades, students } = data.gradebook;
  const fixed = [text.number, text.name, text.universityId, ...(official ? [] : [text.email])];
  const headers = [
    ...fixed,
    ...columns.map(
      (column) =>
        `${column.title}\n${text.kinds[column.kind]} · ${text.outOf(column.maxScore)}${
          column.weight ? ` · ${text.weight(column.weight)}` : ''
        }`,
    ),
    text.total,
    text.band,
    text.status,
  ];
  const sheet = addSheet(book, name, locale, { x: 2, y: 4 });
  banner(
    sheet,
    headers.length,
    `${official ? text.reportTitle.grades : text.grades} — ${data.group.name}`,
    `${text.doctor}: ${data.doctorName} · ${text.language}: ${LANGUAGE_NAMES[locale][data.group.language] ?? ''} · ${text.generated}: ${dateText(new Date(), locale)}`,
    text,
  );
  sheet.getRow(3).height = 6;
  headerRow(sheet, 4, headers, text);
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };

  const totals = standings(data);
  const firstScore = fixed.length + 1;
  // Students still in the group first; those who left after them, greyed.
  const ordered = [...students];
  ordered.forEach((student, index) => {
    const rowNumber = 5 + index;
    const row = sheet.getRow(rowNumber);
    const zebra = index % 2 === 1;
    const values: (string | number | null)[] = [
      index + 1,
      student.name,
      student.universityId ?? '',
      ...(official ? [] : [student.email]),
    ];
    values.forEach((value, column) => {
      const cell = row.getCell(column + 1);
      cell.value = value;
      bodyCell(cell, text, zebra);
    });
    row.getCell(1).alignment = { horizontal: 'center' };

    columns.forEach((column, position) => {
      const cell = row.getCell(firstScore + position);
      const grade = grades.find(
        (entry) => entry.columnId === column.id && entry.studentId === student.id,
      );
      if (grade?.status === 'absent') {
        cell.value = text.absent;
        cell.font = { name: text.font, bold: true, color: { argb: COLOR.red } };
      } else if (grade?.status === 'excused') {
        cell.value = text.excused;
        cell.font = { name: text.font, italic: true, color: { argb: COLOR.gray } };
      } else if (grade?.score !== null && grade?.score !== undefined) {
        cell.value = grade.score;
        if (grade.score < column.maxScore / 2) {
          cell.font = { name: text.font, bold: true, color: { argb: COLOR.red } };
          cell.fill = solid(COLOR.redSoft);
        }
      }
      if (grade?.note) {
        cell.note = grade.note;
      }
      cell.alignment = { horizontal: 'center' };
      bodyCell(cell, text, zebra);
    });

    const total = totals.get(student.id)?.total ?? null;
    const totalCell = row.getCell(firstScore + columns.length);
    totalCell.value = total;
    totalCell.numFmt = '0.0';
    totalCell.alignment = { horizontal: 'center' };
    totalCell.font = { name: text.font, bold: true };
    bodyCell(totalCell, text, zebra);

    const bandCell = row.getCell(firstScore + columns.length + 1);
    if (total !== null) {
      const band = bandOf(total);
      bandCell.value = text.bands[band];
      bandCell.font = { name: text.font, bold: true, color: { argb: BAND_COLORS[band].fg } };
      bandCell.fill = solid(BAND_COLORS[band].bg);
    }
    bandCell.alignment = { horizontal: 'center' };
    bodyCell(bandCell, text, zebra);

    const statusCell = row.getCell(firstScore + columns.length + 2);
    statusCell.value = text.statuses[student.status];
    bodyCell(statusCell, text, zebra);
    if (student.status !== 'active') {
      for (let column = 1; column <= headers.length; column += 1) {
        row.getCell(column).font = { ...row.getCell(column).font, color: { argb: COLOR.gray } };
      }
    }
  });

  // Live summary rows under each score column: they follow any change made in Excel.
  const lastStudentRow = 4 + ordered.length;
  if (ordered.length > 0 && columns.length > 0) {
    const labels: [string, string][] = [
      [text.average, 'AVERAGE'],
      [text.highest, 'MAX'],
      [text.lowest, 'MIN'],
    ];
    labels.forEach(([label, fn], offset) => {
      const row = sheet.getRow(lastStudentRow + 2 + offset);
      const labelCell = row.getCell(2);
      labelCell.value = label;
      labelCell.font = { name: text.font, bold: true, color: { argb: COLOR.navy } };
      labelCell.fill = solid(COLOR.blueSoft);
      labelCell.border = BORDER;
      columns.forEach((_column, position) => {
        const cell = row.getCell(firstScore + position);
        const letter = sheet.getColumn(firstScore + position).letter;
        cell.value = {
          formula: `IFERROR(ROUND(${fn}(${letter}5:${letter}${String(lastStudentRow)}),2),"")`,
        };
        cell.alignment = { horizontal: 'center' };
        cell.font = { name: text.font, bold: true, color: { argb: COLOR.navy } };
        cell.fill = solid(COLOR.blueSoft);
        cell.border = BORDER;
      });
    });
  }

  const after = lastStudentRow + (columns.length > 0 && ordered.length > 0 ? 6 : 2);
  const legend = sheet.getCell(after, 2);
  legend.value = columns.length === 0 ? text.noColumns : text.legend;
  legend.font = { name: text.font, italic: true, color: { argb: COLOR.gray } };

  if (official) {
    const signRow = after + 3;
    sheet.getCell(signRow, 2).value =
      `${text.signature}: ............................................`;
    sheet.getCell(signRow, Math.max(headers.length - 2, 4)).value =
      `${text.stamp}: ....................`;
    sheet.getRow(signRow).font = { name: text.font, bold: true, color: { argb: COLOR.navy } };
  }

  sheet.getColumn(1).width = 5;
  sheet.getColumn(2).width = 28;
  sheet.getColumn(3).width = 16;
  if (!official) {
    sheet.getColumn(4).width = 30;
  }
  columns.forEach((_column, position) => {
    sheet.getColumn(firstScore + position).width = 20;
  });
  sheet.getColumn(firstScore + columns.length).width = 12;
  sheet.getColumn(firstScore + columns.length + 1).width = 13;
  sheet.getColumn(firstScore + columns.length + 2).width = 19;
  sheet.pageSetup.printTitlesRow = '4:4';
}

function summarySheet(
  book: ExcelJS.Workbook,
  data: GroupData,
  text: Text,
  locale: ExportLocale,
  report: ExportReport,
) {
  const sheet = addSheet(book, text.summary, locale);
  banner(sheet, 4, `${text.reportTitle[report]} — ${data.group.name}`, text.platform, text);
  const active = data.gradebook.students.filter((student) => student.status === 'active');
  const totals = standings(data);
  const scored = active
    .map((student) => totals.get(student.id)?.total ?? null)
    .filter((total): total is number => total !== null);
  const average = scored.length > 0 ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
  const passRate =
    scored.length > 0 ? (scored.filter((total) => total >= 50).length / scored.length) * 100 : null;

  const facts: [string, string | number][] = [
    [text.group, data.group.name],
    [text.language, LANGUAGE_NAMES[locale][data.group.language] ?? ''],
    [text.doctor, data.doctorName],
    [text.assistants, data.assistants.join('، ') || '—'],
    [text.students, active.length],
    [text.generated, dateText(new Date(), locale, true)],
  ];
  let row = 4;
  for (const [label, value] of facts) {
    const labelCell = sheet.getCell(row, 1);
    labelCell.value = label;
    labelCell.font = { name: text.font, bold: true, color: { argb: COLOR.navy } };
    labelCell.fill = solid(COLOR.blueSoft);
    labelCell.border = BORDER;
    sheet.mergeCells(row, 2, row, 4);
    const valueCell = sheet.getCell(row, 2);
    valueCell.value = value;
    valueCell.font = { name: text.font };
    valueCell.border = BORDER;
    // Stated outright: a value starting with a digit would otherwise be laid out left to right.
    valueCell.alignment = {
      horizontal: locale === 'ar' ? 'right' : 'left',
      readingOrder: locale === 'ar' ? 'rtl' : 'ltr',
    };
    row += 1;
  }

  row += 1;
  const kpi = (label: string, value: number | string | null, suffix = '', tone = COLOR.navy) => {
    const labelCell = sheet.getCell(row, 1);
    labelCell.value = label;
    labelCell.font = { name: text.font, bold: true };
    labelCell.border = BORDER;
    const valueCell = sheet.getCell(row, 2);
    valueCell.value =
      value === null ? '—' : typeof value === 'number' ? `${value.toFixed(1)}${suffix}` : value;
    valueCell.font = { name: text.font, bold: true, size: 13, color: { argb: tone } };
    valueCell.alignment = { horizontal: 'center' };
    valueCell.border = BORDER;
    row += 1;
  };
  kpi(text.kpis.classAverage, average, '%');
  kpi(text.kpis.passRate, passRate, '%', COLOR.green);

  const bandCounts = new Map<GradeBand, number>();
  for (const total of scored) {
    const band = bandOf(total);
    bandCounts.set(band, (bandCounts.get(band) ?? 0) + 1);
  }
  const bandsLabel = sheet.getCell(row, 1);
  bandsLabel.value = text.kpis.bands;
  bandsLabel.font = { name: text.font, bold: true };
  row += 1;
  for (const band of ['excellent', 'veryGood', 'good', 'pass', 'fail'] as const) {
    const label = sheet.getCell(row, 1);
    label.value = text.bands[band];
    label.font = { name: text.font, bold: true, color: { argb: BAND_COLORS[band].fg } };
    label.fill = solid(BAND_COLORS[band].bg);
    label.border = BORDER;
    const value = sheet.getCell(row, 2);
    const amount = bandCounts.get(band) ?? 0;
    value.value = amount;
    value.alignment = { horizontal: 'center' };
    value.border = BORDER;
    // A bar drawn with characters, readable in print without charts.
    const bar = sheet.getCell(row, 3);
    bar.value = scored.length > 0 ? '█'.repeat(Math.round((amount / scored.length) * 20)) : '';
    bar.font = { name: text.font, color: { argb: BAND_COLORS[band].fg } };
    row += 1;
  }

  row += 1;
  const activities = active.map((student) => student.activity);
  // Each student counts once: away, else quiet, else active.
  kpi(text.kpis.activeThisWeek, String(activities.filter((a) => !a.quiet && !a.away).length));
  kpi(
    text.kpis.quiet,
    String(activities.filter((a) => a.quiet && !a.away).length),
    '',
    COLOR.amber,
  );
  kpi(text.kpis.away, String(activities.filter((a) => a.away).length), '', COLOR.red);
  const { announcements: announcementTotal, polls: pollTotal } = data.gradebook.totals;
  kpi(
    text.kpis.announcementsRead,
    announcementTotal > 0 && activities.length > 0
      ? (activities.reduce((sum, a) => sum + a.announcementsRead, 0) /
          activities.length /
          announcementTotal) *
          100
      : null,
    '%',
  );
  kpi(
    text.kpis.pollsAnswered,
    pollTotal > 0 && activities.length > 0
      ? (activities.reduce((sum, a) => sum + a.pollsAnswered, 0) / activities.length / pollTotal) *
          100
      : null,
    '%',
  );

  sheet.getColumn(1).width = 36;
  sheet.getColumn(2).width = 30;
  sheet.getColumn(3).width = 24;
  sheet.getColumn(4).width = 12;
}

function activitySheet(book: ExcelJS.Workbook, data: GroupData, text: Text, locale: ExportLocale) {
  const headers = [text.number, text.name, ...text.activityHeaders];
  const sheet = addSheet(book, text.activity, locale, { x: 2, y: 4 });
  banner(sheet, headers.length, `${text.activity} — ${data.group.name}`, text.platform, text);
  headerRow(sheet, 4, headers, text);
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };
  const { announcements: announcementTotal, polls: pollTotal } = data.gradebook.totals;
  data.gradebook.students
    .filter((student) => student.status === 'active')
    .forEach((student, index) => {
      const a = student.activity;
      const row = sheet.getRow(5 + index);
      const flag = a.away ? text.awayFlag : a.quiet ? text.quietFlag : text.activeFlag;
      const values = [
        index + 1,
        student.name,
        a.messages,
        a.messagesThisWeek,
        dateCell(a.lastMessageAt),
        dateCell(a.lastSeenAt),
        `${String(a.announcementsRead)} / ${String(announcementTotal)}`,
        `${String(a.pollsAnswered)} / ${String(pollTotal)}`,
        a.filesShared,
        flag,
      ];
      values.forEach((value, column) => {
        const cell = row.getCell(column + 1);
        cell.value = value;
        if (value instanceof Date) {
          cell.numFmt = 'yyyy-mm-dd hh:mm';
        }
        if (column !== 1) {
          cell.alignment = { horizontal: 'center' };
        }
        bodyCell(cell, text, index % 2 === 1);
      });
      const flagCell = row.getCell(values.length);
      const tone = a.away
        ? { fg: COLOR.red, bg: COLOR.redSoft }
        : a.quiet
          ? { fg: COLOR.amber, bg: COLOR.amberSoft }
          : { fg: COLOR.green, bg: COLOR.greenSoft };
      flagCell.font = { name: text.font, bold: true, color: { argb: tone.fg } };
      flagCell.fill = solid(tone.bg);
    });
  sheet.getColumn(1).width = 5;
  sheet.getColumn(2).width = 28;
  for (let column = 3; column <= headers.length; column += 1) {
    sheet.getColumn(column).width = 17;
  }
}

function announcementsSheet(
  book: ExcelJS.Workbook,
  data: GroupData,
  text: Text,
  locale: ExportLocale,
) {
  const headers = text.announcementHeaders;
  const sheet = addSheet(book, text.announcements, locale, { x: 1, y: 4 });
  banner(sheet, headers.length, `${text.announcements} — ${data.group.name}`, text.platform, text);
  headerRow(sheet, 4, headers, text);
  const audience = data.gradebook.students.filter((student) => student.status === 'active');
  data.announcements.forEach((announcement, index) => {
    const read = audience.filter((student) => announcement.readers.has(student.id));
    const unread = audience.filter((student) => !announcement.readers.has(student.id));
    const rate = audience.length > 0 ? read.length / audience.length : 0;
    const row = sheet.getRow(5 + index);
    const values = [
      announcement.title,
      announcement.createdAt,
      announcement.author,
      announcement.important ? text.yes : '',
      read.length,
      audience.length,
      rate,
      unread.map((student) => student.name).join('، '),
    ];
    values.forEach((value, column) => {
      const cell = row.getCell(column + 1);
      cell.value = value;
      bodyCell(cell, text, index % 2 === 1);
    });
    row.getCell(2).numFmt = 'yyyy-mm-dd';
    row.getCell(7).numFmt = '0%';
    row.getCell(7).font = {
      name: text.font,
      bold: true,
      color: { argb: rate >= 0.8 ? COLOR.green : rate >= 0.5 ? COLOR.amber : COLOR.red },
    };
    row.getCell(8).alignment = { wrapText: true, vertical: 'top' };
    if (announcement.important) {
      row.getCell(1).font = { name: text.font, bold: true, color: { argb: COLOR.orange } };
    }
  });
  const widths = [36, 13, 20, 8, 8, 8, 9, 60];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

function pollsSheet(book: ExcelJS.Workbook, data: GroupData, text: Text, locale: ExportLocale) {
  const headers = text.pollHeaders;
  const sheet = addSheet(book, text.polls, locale, { x: 1, y: 4 });
  banner(sheet, headers.length, `${text.polls} — ${data.group.name}`, text.platform, text);
  headerRow(sheet, 4, headers, text);
  const audience = data.gradebook.students.filter((student) => student.status === 'active').length;
  data.polls.forEach((poll, index) => {
    const row = sheet.getRow(5 + index);
    const results = poll.options
      .map((option) => `${option.text}: ${String(option.votes)}`)
      .join('\n');
    const values = [
      poll.question,
      poll.createdAt,
      poll.author,
      poll.voters,
      audience,
      results,
      poll.closed ? text.pollClosed : text.pollOpen,
    ];
    values.forEach((value, column) => {
      const cell = row.getCell(column + 1);
      cell.value = value;
      bodyCell(cell, text, index % 2 === 1);
    });
    row.getCell(2).numFmt = 'yyyy-mm-dd';
    row.getCell(6).alignment = { wrapText: true, vertical: 'top' };
  });
  const widths = [40, 13, 20, 8, 8, 44, 10];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

function membersSheet(book: ExcelJS.Workbook, data: GroupData, text: Text, locale: ExportLocale) {
  const headers = text.memberHeaders;
  const sheet = addSheet(book, text.members, locale, { x: 1, y: 4 });
  banner(sheet, headers.length, `${text.members} — ${data.group.name}`, text.platform, text);
  headerRow(sheet, 4, headers, text);
  data.gradebook.students.forEach((student, index) => {
    const row = sheet.getRow(5 + index);
    const values = [
      student.name,
      text.roles[data.roles.get(student.id) ?? 'student'],
      text.statuses[student.status],
      new Date(student.joinedAt),
      student.email,
      student.universityId ?? '',
    ];
    values.forEach((value, column) => {
      const cell = row.getCell(column + 1);
      cell.value = value;
      bodyCell(cell, text, index % 2 === 1);
    });
    row.getCell(4).numFmt = 'yyyy-mm-dd';
  });
  const widths = [28, 18, 16, 13, 32, 16];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

/**
 * Who handed in what: a row per student and a column per assignment, with the day it was handed
 * in. The scores themselves are on the grade sheet, where each assignment has its column.
 */
function assignmentsSheet(
  book: ExcelJS.Workbook,
  data: GroupData,
  text: Text,
  locale: ExportLocale,
) {
  const fixed = text.assignmentHeaders;
  const headers = [
    ...fixed,
    ...data.assignments.map(
      (assignment) =>
        `${assignment.title}\n${text.due}: ${assignment.dueAt ? dateText(assignment.dueAt, locale) : text.noDue}`,
    ),
  ];
  const sheet = addSheet(book, text.assignments, locale, { x: 2, y: 4 });
  banner(
    sheet,
    Math.max(headers.length, 4),
    `${text.assignments} — ${data.group.name}`,
    text.platform,
    text,
  );
  headerRow(sheet, 4, headers, text);
  const students = data.gradebook.students.filter((student) => student.status === 'active');
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' });

  students.forEach((student, index) => {
    const row = sheet.getRow(5 + index);
    [index + 1, student.name, student.universityId ?? ''].forEach((value, column) => {
      const cell = row.getCell(column + 1);
      cell.value = value;
      bodyCell(cell, text, index % 2 === 1);
    });
    data.assignments.forEach((assignment, position) => {
      const cell = row.getCell(fixed.length + position + 1);
      const handedIn = assignment.handedIn.get(student.id);
      if (!handedIn) {
        cell.value = text.notHandedIn;
        cell.font = { color: { argb: COLOR.red } };
        cell.fill = solid(COLOR.redSoft);
      } else if (handedIn.late) {
        cell.value = `${text.handedInLate} · ${day.format(handedIn.at)}`;
        cell.font = { color: { argb: COLOR.amber } };
        cell.fill = solid(COLOR.amberSoft);
      } else {
        cell.value = `${text.handedIn} · ${day.format(handedIn.at)}`;
        cell.font = { color: { argb: COLOR.green } };
      }
      cell.alignment = { horizontal: 'center' };
      bodyCell(cell, text, index % 2 === 1);
    });
  });

  let last = 5 + students.length;
  if (data.assignments.length > 0 && students.length > 0) {
    const row = sheet.getRow(last + 1);
    const label = row.getCell(2);
    label.value = text.handedInCount;
    label.font = { name: text.font, bold: true, color: { argb: COLOR.navy } };
    label.fill = solid(COLOR.blueSoft);
    label.border = BORDER;
    data.assignments.forEach((assignment, position) => {
      const cell = row.getCell(fixed.length + position + 1);
      const count = students.filter((student) => assignment.handedIn.has(student.id)).length;
      cell.value = `${String(count)} / ${String(students.length)}`;
      cell.font = { name: text.font, bold: true, color: { argb: COLOR.navy } };
      cell.fill = solid(COLOR.blueSoft);
      cell.alignment = { horizontal: 'center' };
      cell.border = BORDER;
    });
    last += 2;
  }
  const note = sheet.getCell(last + 1, 2);
  note.value = data.assignments.length === 0 ? text.noAssignments : text.assignmentsNote;
  note.font = { name: text.font, italic: true, size: 10, color: { argb: COLOR.gray } };

  sheet.getColumn(1).width = 6;
  sheet.getColumn(2).width = 28;
  sheet.getColumn(3).width = 16;
  data.assignments.forEach((_assignment, position) => {
    sheet.getColumn(fixed.length + position + 1).width = 26;
  });
}

function newBook(): ExcelJS.Workbook {
  const book = new ExcelJS.Workbook();
  book.creator = 'ACU Languages';
  book.company = 'Ahram Canadian University';
  book.created = new Date();
  return book;
}

function fillGroupBook(
  book: ExcelJS.Workbook,
  data: GroupData,
  report: ExportReport,
  locale: ExportLocale,
) {
  const text = TEXT[locale];
  if (report === 'grades') {
    gradesSheet(book, data, text, locale, text.grades, true);
    return;
  }
  summarySheet(book, data, text, locale, report);
  if (report === 'full') {
    gradesSheet(book, data, text, locale, text.grades, false);
  }
  if (report === 'full') {
    assignmentsSheet(book, data, text, locale);
  }
  activitySheet(book, data, text, locale);
  announcementsSheet(book, data, text, locale);
  pollsSheet(book, data, text, locale);
  if (report === 'full') {
    membersSheet(book, data, text, locale);
  }
}

export interface ExportContext {
  db: Database;
  now: () => Date;
  ipAddress: string | undefined;
}

/** One group's workbook, for its staff. */
export async function exportGroup(
  context: ExportContext,
  user: User,
  groupId: string,
  report: ExportReport,
  locale: ExportLocale,
): Promise<{ buffer: Buffer; fileName: string }> {
  const access = await groupAccess(context.db, user, groupId);
  assertCan(access, 'teach');
  const data = await gatherGroup(context.db, access.group, context.now());
  const book = newBook();
  fillGroupBook(book, data, report, locale);
  await recordAudit(context.db, {
    at: context.now(),
    actorUserId: user.id,
    action: 'group.grades_exported',
    metadata: { groupId: access.group.id, report },
    ipAddress: context.ipAddress,
  });
  const date = context.now().toISOString().slice(0, 10);
  return {
    buffer: Buffer.from(await book.xlsx.writeBuffer()),
    fileName: `${access.group.name} - ${TEXT[locale].reportTitle[report]} - ${date}.xlsx`,
  };
}

/** Every group a doctor owns in one workbook: an overview, then each group's grade sheet. */
export async function exportAllGroups(
  context: ExportContext,
  doctor: User,
  locale: ExportLocale,
): Promise<{ buffer: Buffer; fileName: string }> {
  const text = TEXT[locale];
  const owned = await context.db
    .select()
    .from(groups)
    .where(eq(groups.doctorId, doctor.id))
    .orderBy(asc(groups.archivedAt), desc(groups.createdAt), asc(groups.name));
  const book = newBook();
  const overview = addSheet(book, text.overview, locale, { x: 1, y: 4 });
  banner(overview, text.overviewHeaders.length, text.overview, text.platform, text);
  headerRow(overview, 4, text.overviewHeaders, text);

  const used = new Set<string>([text.overview]);
  for (const [index, group] of owned.entries()) {
    const data = await gatherGroup(context.db, group, context.now());
    const totals = standings(data);
    const active = data.gradebook.students.filter((student) => student.status === 'active');
    const scored = active
      .map((student) => totals.get(student.id)?.total ?? null)
      .filter((total): total is number => total !== null);
    const row = overview.getRow(5 + index);
    const values = [
      group.name,
      LANGUAGE_NAMES[locale][group.language] ?? '',
      active.length,
      scored.length > 0 ? scored.reduce((a, b) => a + b, 0) / scored.length : '',
      scored.length > 0 ? (scored.filter((t) => t >= 50).length / scored.length) * 100 : '',
      group.archivedAt ? text.archived : text.running,
    ];
    values.forEach((value, column) => {
      const cell = row.getCell(column + 1);
      cell.value = value;
      bodyCell(cell, text, index % 2 === 1);
    });
    row.getCell(4).numFmt = '0.0';
    row.getCell(5).numFmt = '0.0';

    let name = group.name.slice(0, 28);
    for (let suffix = 2; used.has(name); suffix += 1) {
      name = `${group.name.slice(0, 25)} (${String(suffix)})`;
    }
    used.add(name);
    gradesSheet(book, data, text, locale, name, false);
  }
  [32, 14, 10, 16, 14, 12].forEach((width, index) => {
    overview.getColumn(index + 1).width = width;
  });

  await recordAudit(context.db, {
    at: context.now(),
    actorUserId: doctor.id,
    action: 'group.grades_exported',
    metadata: { all: true, groups: owned.length },
    ipAddress: context.ipAddress,
  });
  const date = context.now().toISOString().slice(0, 10);
  return {
    buffer: Buffer.from(await book.xlsx.writeBuffer()),
    fileName: `${text.overview} - ${date}.xlsx`,
  };
}

/** Sends a workbook as a download; the name is spelled for every browser, Arabic included. */
export function sendWorkbook(res: Response, buffer: Buffer, fileName: string): void {
  const ascii = fileName.replace(/[^ -~]/g, '_').replace(/"/g, '');
  res
    .status(200)
    .set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Length': String(buffer.length),
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'no-store',
    })
    .end(buffer);
}
