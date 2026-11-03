// Site identity, contact links, the homepage intro and the phrases the typography pass keeps on one line.
// Copy uses the site's inline markup ([label](href), `code`); typography (curly quotes, NBSPs, glued separators) is
// applied at render time by src/lib/typography.ts, so strings here stay plain.

export const SITE = {
  title: 'Yifan Luo',
  description:
    'Yifan Luo: computer science at UIUC. I build perception systems that run on real hardware: a shipped camera app and robot learning from my own demonstrations.',
};

/** The link preview's alt text: the image is the Framelight hero's three real screens (the media script's `og` job). */
export const OG_IMAGE_ALT =
  'Three Framelight screens from one iPhone at golden hour: the live view asking “Move up-left”, the phone turned sideways at “Perfect!”, and the photo just taken with its film looks.';

export const EMAIL = 'yifan65@illinois.edu';
export const RESUME = '/yifan-luo-resume.pdf';
export const GITHUB = 'https://github.com/im-yifanluo';
export const LINKEDIN = 'https://www.linkedin.com/in/luo-yifan';

/** The site's last content revision ("YYYY-MM"). The footer's "Last updated" is the newer of this and the newest News
 *  item, so it never points at an item that was removed. */
export const REVISED = '2026-11';

/** One line of copy. `keep`: phrases kept on one line (glue); `short`: a phrase's phone form (below 720 px). */
export interface Line { text: string; keep?: string[]; short?: Record<string, string> }

export const INTRO = {
  /** Two quiet lines under the name: degree and school, then standing. Below 720 px the university's name reads "UIUC"
   *  (an <abbr> keeps the full name), and line 1 breaks after the comma, never inside the name. */
  sub: [
    { text: 'B.S. Computer Science, University of Illinois Urbana-Champaign', keep: ['B.S. Computer Science,', 'University of Illinois Urbana-Champaign'], short: { 'University of Illinois Urbana-Champaign': 'UIUC' } },
    { text: 'Expected May 2028 · 4.00 GPA · James Scholar Honors Student' },
  ] satisfies Line[],
  bio: [
    {
      text:
        "I build perception systems that run on real hardware. As technical lead of [Framelight](/framelight/), I led a 15-person team to ship it on the App Store and Google Play: a camera app that coaches your framing on the phone. At UIUC's RoboTouch Lab I train the models that move a robot arm from demonstrations I record, work that won URSA's Best Research Poster Award.",
    },
    { text: "I'm seeking a Summer 2027 internship in perception, on-device ML or robot learning." },
  ] satisfies Line[],
};

/** Phrases the typography pass never splits across lines. */
export const TYPOGRAPHY = {
  /** Short names that read as one unit, everywhere. */
  keep: ['App Store', 'Google Play', 'RoboTouch Lab', 'FORWARD Data Lab', 'James Scholar', 'Dean’s List', 'Cal Hacks 13'],
  /** News keeps only short glue (a rank that must not split); text-wrap: pretty sets full lines for the rest. */
  newsKeep: ['#17 of 4,013'],
  /** Award names in the Awards list. */
  awardKeep: ['Best Research Poster Award', '#17 of 4,013 overall', '#5 in the knockout stage', 'Rodger Allan Mathematics Award', '2026 FIFA World Cup', 'Certificate of Distinction', 'School Champion', 'top 4% worldwide', '214th of 19,654', 'highest graduating average', 'First Place, Mobile and Web'],
  /** Kept whole from 720 px up only: on a phone line these long names would leave ragged lines. */
  awardKeepWide: ['Cozad New Venture Challenge', 'IgniteCS Programming Expo'],
  /** Phrases a project title (h1 and the homepage row's h3) never splits. */
  titleKeep: ['context assembly'],
  /** Kept whole from 720 px up only (on a 390 px phone it would push the robot page's h1 to three lines). */
  titleKeepWide: ['real UR5e'],
};
/** The navy award line under a project's meta (homepage row, project page) keeps every award name whole at every width. */
export const AWARD_LINE_KEEP = [...TYPOGRAPHY.awardKeep, ...TYPOGRAPHY.awardKeepWide];
