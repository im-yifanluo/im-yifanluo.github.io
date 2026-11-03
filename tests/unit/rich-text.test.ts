import { describe, expect, it } from 'vitest';
import { escapeHtml, rich, segs } from '@/lib/rich-text';
import { NB, plain, SEP } from '@/lib/typography';

describe('escapeHtml', () => {
  it('escapes the five HTML special characters', () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;',
    );
  });

  it('leaves everything else as it is', () => {
    expect(escapeHtml('é – · ` [x](y)')).toBe('é – · ` [x](y)');
  });
});

describe('rich', () => {
  it('escapes the text', () => {
    expect(rich('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
    expect(rich('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('applies the typography pass', () => {
    expect(rich(`it's "here"...`)).toBe('it’s “here”…');
    expect(rich('a · b')).toBe(`a${SEP}b`);
  });

  it('renders links, escaping the address', () => {
    expect(rich('[Framelight](/framelight/) is live')).toBe('<a href="/framelight/">Framelight</a> is live');
    expect(rich('see [the docs](https://example.com/a?b=1&c=2)')).toBe(
      'see <a href="https://example.com/a?b=1&amp;c=2">the docs</a>',
    );
    expect(rich('[x](/a"b<c)')).toBe('<a href="/a&quot;b&lt;c">x</a>');
  });

  it('applies the typography pass to a link label', () => {
    expect(rich(`[it's](/x) "here"`)).toBe('<a href="/x">it’s</a> “here”');
  });

  it('renders code spans escaped and untouched by the typography pass', () => {
    expect(rich('run `a -> "b" & c...` now')).toBe('run <code>a -&gt; &quot;b&quot; &amp; c...</code> now');
    expect(rich('[`npm test`](/x)')).toBe('<a href="/x"><code>npm test</code></a>');
  });

  it('leaves an unmatched backtick or bracket as text', () => {
    expect(rich('a ` b [c] (d)')).toBe('a ` b [c] (d)');
  });
});

describe('plain', () => {
  it('drops the markup and keeps the typography', () => {
    expect(plain(`[Framelight](/framelight/) runs \`C++\` and it's "fast" · ok`)).toBe(
      `Framelight runs C++ and it’s “fast”${NB}· ok`,
    );
  });

  it('does not escape', () => {
    expect(plain('a & b')).toBe('a & b');
  });
});

describe('segs', () => {
  it('splits a meta line at " · " into items joined by SEP', () => {
    expect(segs('a · b')).toBe(`<span class="nw seg">a</span>${SEP}<span class="nw seg">b</span>`);
  });

  it('splits only at a spaced dot', () => {
    expect(segs('a·b')).toBe('<span class="nw seg">a·b</span>');
  });

  it('splits only outside links and code spans', () => {
    expect(segs('[a · b](/x) · `c · d`')).toBe(
      `<span class="nw seg"><a href="/x">a${SEP}b</a></span>${SEP}<span class="nw seg"><code>c · d</code></span>`,
    );
  });

  // an item of up to 40 characters is kept whole everywhere, one of 41-44 from 720 px up, a longer one is not
  it.each([
    [40, 'nw seg'],
    [41, 'nw-w seg'],
    [44, 'nw-w seg'],
    [45, 'seg'],
  ])('gives an item of %i characters the classes "%s"', (n, classes) => {
    expect(segs('x'.repeat(n))).toBe(`<span class="${classes}">${'x'.repeat(n)}</span>`);
  });

  it('measures an item without its markup', () => {
    expect(segs(`[${'x'.repeat(40)}](/a-long-address/)`)).toMatch(/^<span class="nw seg">/);
  });

  it('appends the extra items, kept whole', () => {
    expect(segs('a', ['<time>x</time>'])).toBe(
      `<span class="nw seg">a</span>${SEP}<span class="nw seg"><time>x</time></span>`,
    );
  });
});
