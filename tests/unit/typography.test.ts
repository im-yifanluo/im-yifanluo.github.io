import { describe, expect, it } from 'vitest';
import { rich } from '@/lib/rich-text';
import { glue, NB, SEP, shortForms, typoHtml, typoText } from '@/lib/typography';
import { INTRO, TYPOGRAPHY, type Line } from '@/site.config';

/** An HTML fragment's text, without its tags. */
const text = (html: string) => html.replace(/<[^>]+>/g, '');

describe('typoText', () => {
  it('curls quotes and apostrophes', () => {
    expect(typoText(`"Hello," I said, 'it's fine'`)).toBe('“Hello,” I said, ‘it’s fine’');
    expect(typoText(`('a') ["b"] —"c" '"d"'`)).toBe('(‘a’) [“b”] —“c” ‘“d”’');
  });

  it('decodes the quotes escapeHtml writes before curling them', () => {
    expect(typoText('it&#39;s, it&#x27;s, it&apos;s, &quot;so&quot;')).toBe('it’s, it’s, it’s, “so”');
  });

  it('writes "Sep", never "Sept"', () => {
    expect(typoText('Sept 2025')).toBe(`Sep${NB}2025`);
    expect(typoText('September')).toBe('September');
  });

  it('writes an ellipsis and an arrow', () => {
    expect(typoText('wait... a -> b')).toBe('wait… a → b');
  });

  it('glues " · " and a spaced en dash to the item before them', () => {
    expect(typoText('a · b – c')).toBe(`a${NB}· b${NB}– c`);
  });

  it.each(['Jan', 'May', 'Sep', 'Dec', 'Spring', 'Summer', 'Fall', 'Winter'])('keeps "%s" with its year', (m) => {
    expect(typoText(`${m} 2026`)).toBe(`${m}${NB}2026`);
  });

  it('keeps numbers with their units, "ROS 2" and course numbers', () => {
    expect(typoText('5 kg, 30 Hz, 10 ms, 2 s, 3 MB, 4 points, 12 px, 1 / 2')).toBe(
      `5${NB}kg, 30${NB}Hz, 10${NB}ms, 2${NB}s, 3${NB}MB, 4${NB}points, 12${NB}px, 1${NB}/${NB}2`,
    );
    expect(typoText('ROS 2 and CS 498')).toBe(`ROS${NB}2 and CS${NB}498`);
  });

  it('keeps "Prof." and "et" with the word after them', () => {
    expect(typoText('Prof. Lee et al.')).toBe(`Prof.${NB}Lee et${NB}al.`);
  });
});

describe('typoHtml', () => {
  it('changes the text only: never a tag or a code span', () => {
    expect(typoHtml(`<a href="it's">it's</a> <code>a -> "b"...</code> -> "c"`)).toBe(
      `<a href="it's">it’s</a> <code>a -> "b"...</code> → “c”`,
    );
  });

  // copy is written with straight apostrophes, which the pass curls before it looks for the phrases
  it.each(TYPOGRAPHY.keep)('keeps "%s" on one line', (phrase) => {
    expect(typoHtml(`with ${phrase.replaceAll('’', "'")} here`)).toContain(`<span class="nw">${phrase}</span>`);
  });

  it('keeps "15-person"-style compounds and number ranges whole', () => {
    expect(typoHtml('a 15-person team')).toBe('a <span class="nw">15-person</span> team');
    expect(typoHtml('a 1,000-page report')).toBe('a <span class="nw">1,000-page</span> report');
    expect(typoHtml('about 4–5 points')).toBe(`about <span class="nw">4–5</span>${NB}points`);
  });

  it('keeps hyphenated compounds of up to 14 characters whole', () => {
    expect(typoHtml('end-to-end')).toBe('<span class="nw cpd">end-to-end</span>');
    expect(typoHtml('hand-annotated')).toBe('<span class="nw cpd">hand-annotated</span>');
    expect(typoHtml('self-supervised')).toBe('self-supervised');
    expect(typoHtml('example.com/a-b')).toBe('example.com/a-b');
  });

  it('keeps "Prof." with a full name', () => {
    expect(typoHtml('with Prof. Ada Lovelace')).toBe(`with <span class="nw">Prof.${NB}Ada Lovelace</span>`);
  });

  it('turns " · " into SEP', () => {
    expect(typoHtml('a · b')).toBe(`a${SEP}b`);
  });
});

describe('SEP', () => {
  it('is a dot glued to the item before it, hidden from assistive tech', () => {
    expect(text(SEP)).toBe(`${NB}· `);
    expect(SEP).toMatch(new RegExp(`^<span class="sep"><span aria-hidden="true">${NB}·</span></span> $`));
  });
});

describe('glue', () => {
  it('wraps each phrase in a no-break span', () => {
    expect(glue('a Best Poster Award here', ['Best Poster Award'])).toBe(
      'a <span class="nw">Best Poster Award</span> here',
    );
  });

  it('keeps the wide phrases whole with .nw-w', () => {
    expect(glue('the Big Long Name', [], ['Big Long Name'])).toBe('the <span class="nw-w">Big Long Name</span>');
  });

  it('changes nothing without phrases', () => {
    expect(glue('a b')).toBe('a b');
  });
});

describe('shortForms', () => {
  it('pairs a phrase with its phone form', () => {
    expect(shortForms('at Big University now', { 'Big University': 'BU' })).toBe(
      'at <span class="lg">Big University</span><abbr class="sm" title="Big University">BU</abbr> now',
    );
  });

  it('wraps a glued phrase whole', () => {
    expect(shortForms(glue('at Big University', ['Big University']), { 'Big University': 'BU' })).toBe(
      'at <span class="lg"><span class="nw">Big University</span></span><abbr class="sm" title="Big University">BU</abbr>',
    );
  });

  const lines: Line[] = INTRO.sub;
  it.each(lines.filter((l) => l.short))('renders the phone forms of "$text"', (line) => {
    const html = shortForms(glue(rich(line.text), line.keep), line.short);
    for (const [full, short] of Object.entries(line.short ?? {})) {
      expect(html).toContain(`<abbr class="sm" title="${full}">${short}</abbr>`);
      expect(text(html)).toContain(`${full}${short}`);
    }
  });
});
