import { describe, expect, it } from 'vitest';
import { head, line, route, type Box } from '@/components/diagrams/geometry';
import type { Route } from '@/lib/diagrams';

/** A box at (left, top), measured as flow.ts measures one. */
const box = (left: number, top: number, width = 100, height = 40): Box => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  cx: left + width / 2,
  cy: top + height / 2,
});

const band = () => 0;

describe('route', () => {
  const a = box(0, 0);

  it('h: joins the facing sides at the middle of the vertical overlap', () => {
    expect(route('h', a, box(200, 10), { band })).toEqual([
      [100, 25],
      [200, 25],
    ]);
    expect(route('h', a, box(-200, 10), { band })).toEqual([
      [0, 25],
      [-100, 25],
    ]);
    // no overlap: level with the source's centre
    expect(route('h', a, box(200, 100), { band })).toEqual([
      [100, 20],
      [200, 20],
    ]);
  });

  it('v: joins bottom to top at the middle of the horizontal overlap, or at fromAt', () => {
    expect(route('v', a, box(50, 100), { band })).toEqual([
      [75, 40],
      [75, 100],
    ]);
    expect(route('v', box(50, 100), a, { band })).toEqual([
      [75, 100],
      [75, 40],
    ]);
    expect(route('v', a, box(50, 100), { fromAt: 0.25, band })).toEqual([
      [25, 40],
      [25, 100],
    ]);
    expect(route('v', a, box(50, 100), { fromAt: 0, band })).toEqual([
      [0, 40],
      [0, 100],
    ]);
  });

  it('hv: out of the source side, then into the target at toAt', () => {
    expect(route('hv', a, box(150, 100), { band })).toEqual([
      [100, 20],
      [200, 20],
      [200, 100],
    ]);
    expect(route('hv', a, box(-150, -100), { toAt: 0.2, band })).toEqual([
      [0, 20],
      [-130, 20],
      [-130, -60],
    ]);
  });

  it('vh: out of the source bottom at fromAt, then into the target side', () => {
    expect(route('vh', a, box(200, 100), { band })).toEqual([
      [50, 40],
      [50, 120],
      [200, 120],
    ]);
    expect(route('vh', a, box(-200, -100), { fromAt: 0.1, band })).toEqual([
      [10, 0],
      [10, -80],
      [-100, -80],
    ]);
  });

  it('elbow: straight within a row, else across, down the middle of the gap and across', () => {
    expect(route('elbow', a, box(200, 0), { band })).toEqual([
      [100, 20],
      [200, 20],
    ]);
    expect(route('elbow', a, box(200, 100), { band })).toEqual([
      [100, 20],
      [150, 20],
      [150, 120],
      [200, 120],
    ]);
  });

  it('over / under: a channel 14 px (or `channel`) above or below both boxes', () => {
    const from = box(0, 50),
      to = box(200, 40);
    expect(route('over', from, to, { band })).toEqual([
      [50, 50],
      [50, 26],
      [250, 26],
      [250, 40],
    ]);
    expect(route('under', from, to, { channel: 20, band })).toEqual([
      [50, 90],
      [50, 110],
      [250, 110],
      [250, 80],
    ]);
  });

  it('gap: down from the source, along a channel under its band, into the target top', () => {
    expect(route('gap', a, box(200, 200), { fromAt: 0.2, toAt: 0.8, band: () => 120 })).toEqual([
      [20, 40],
      [20, 134],
      [280, 134],
      [280, 200],
    ]);
  });

  it('throws on an unknown route', () => {
    expect(() => route('zigzag' as Route, a, box(200, 0), { band })).toThrow('unknown route "zigzag"');
  });
});

describe('line', () => {
  it('rounds every coordinate to 0.5 px', () => {
    expect(
      line([
        [0.24, 0.26],
        [10.74, 9.76],
      ]),
    ).toBe('M0 0.5L10.5 10');
  });

  it('rounds each bend with a radius of 6 px', () => {
    expect(
      line([
        [0, 0],
        [100, 0],
        [100, 100],
      ]),
    ).toBe('M0 0L94 0Q100 0 100 6L100 100');
  });

  it('caps the radius at half of the shorter segment', () => {
    expect(
      line([
        [0, 0],
        [4, 0],
        [4, 100],
      ]),
    ).toBe('M0 0L2 0Q4 0 4 2L4 100');
  });

  it('survives a zero-length segment', () => {
    expect(
      line([
        [0, 0],
        [0, 0],
        [10, 0],
      ]),
    ).toBe('M0 0L0 0Q0 0 0.5 0L10 0');
  });
});

describe('head', () => {
  it('draws an open chevron 6 px long and 8 px wide at the tip', () => {
    expect(head([100, 0], [0, 0])).toBe('M94 4L100 0L94 -4');
    expect(head([0, 100], [0, 0])).toBe('M-4 94L0 100L4 94');
  });

  it('rounds a slanted chevron to 0.5 px', () => {
    expect(head([10, 10], [0, 0])).toBe('M3 8.5L10 10L8.5 3');
  });
});
