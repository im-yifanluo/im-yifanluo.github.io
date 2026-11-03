import { describe, expect, it } from 'vitest';
import { dateHtml, month, monthHtml, rangeHtml } from '@/lib/dates';
import { NB } from '@/lib/typography';
import { schemaOf } from './load';

describe('month', () => {
  it('writes "Mon YYYY" with a no-break space', () => {
    expect(month('2026-10')).toBe(`Oct${NB}2026`);
    expect(month('2026-01')).toBe(`Jan${NB}2026`);
    expect(month('2026-12')).toBe(`Dec${NB}2026`);
  });

  it('writes "Sep", never "Sept"', () => {
    expect(month('2025-09')).toBe(`Sep${NB}2025`);
  });
});

describe('monthHtml', () => {
  it('wraps the month in a <time>', () => {
    expect(monthHtml('2026-10')).toBe(`<time datetime="2026-10">Oct${NB}2026</time>`);
  });
});

describe('rangeHtml', () => {
  it('names the year once within one year', () => {
    expect(rangeHtml('2026-04', '2026-07')).toBe(
      `<time datetime="2026-04">Apr</time>${NB}– <time datetime="2026-07">Jul${NB}2026</time>`,
    );
  });

  it('runs to "present"', () => {
    expect(rangeHtml('2025-09', 'present')).toBe(`<time datetime="2025-09">Sep${NB}2025</time>${NB}– present`);
  });

  it('names both years across a year', () => {
    expect(rangeHtml('2025-12', '2026-08')).toBe(
      `<time datetime="2025-12">Dec${NB}2025</time>${NB}– <time datetime="2026-08">Aug${NB}2026</time>`,
    );
  });

  it('writes a one-month range as that month', () => {
    expect(rangeHtml('2026-05', '2026-05')).toBe(`<time datetime="2026-05">May${NB}2026</time>`);
  });
});

describe('dateHtml', () => {
  it('renders a month, a year and a span of years', () => {
    expect(dateHtml('2026-10')).toBe(monthHtml('2026-10'));
    expect(dateHtml('2026-01')).toBe(monthHtml('2026-01'));
    expect(dateHtml('2026-12')).toBe(monthHtml('2026-12'));
    expect(dateHtml('2024')).toBe('<time datetime="2024">2024</time>');
    expect(dateHtml('2024–25')).toBe('<time datetime="2024">2024</time>–<time datetime="2025">25</time>');
  });

  const valid = ['2026-01', '2026-12', '2024', '2024–25'];
  const invalid = [
    '2026-00',
    '2026-13',
    '2026-1',
    '2026-10-01',
    '26',
    '2024-25',
    '2024–2025',
    '2024—25',
    'May 2026',
    ' 2026',
    '',
  ];
  it.each(invalid)('throws on "%s"', (d) => {
    expect(() => dateHtml(d)).toThrow('expected YYYY-MM, YYYY or YYYY–YY');
  });

  // the date column of a dated list (here More projects) takes the forms dateHtml renders, and only those
  it.each([...valid, ...invalid])('agrees with the dated-list schema on "%s"', (date) => {
    expect(schemaOf('more').safeParse({ position: 0, date, text: 'x' }).success).toBe(valid.includes(date));
  });
});
