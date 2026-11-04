// Video loops (PosterBox.astro: <video data-mp4 data-webm [data-hi-mp4 data-hi-webm]>, no sources until needed).
// A loop gets its sources and plays only while in view; it pauses off-screen, in a hidden tab, on the page's Pause
// control, and under reduced motion, where it plays only while pointed at or focused. Save-Data keeps the posters.

const AV1 = 'video/webm; codecs="av01.0.05M.08"';
const STORAGE_KEY = 'motion';

/** The element whose hover or focus plays a loop under reduced motion. */
const hoverBox = (video: HTMLVideoElement) => video.closest('.entry, .p-body, figure') ?? video.parentElement!;

/** Adds the sources (the high-density rendition when the box is wider than the base one) and starts loading. */
function attachSources(video: HTMLVideoElement): void {
  const data = video.dataset;
  if (data.on) return;
  data.on = '1';
  const hiDpi = !!data.hiMp4 && video.clientWidth * devicePixelRatio > video.width * 1.1;
  const sources: [type: string, src: string | undefined][] = [
    [AV1, hiDpi ? data.hiWebm : data.webm],
    ['video/mp4', hiDpi ? data.hiMp4 : data.mp4],
  ];
  for (const [type, src] of sources) {
    const source = document.createElement('source');
    source.type = type;
    source.src = src!;
    video.append(source);
  }
  const poster = video.parentElement!.querySelector('img');
  if (poster?.currentSrc) video.poster = poster.currentSrc;
  video.addEventListener('playing', () => video.classList.add('on'), { once: true });
  video.load();
}

export function initLoops(): void {
  const videos = [...document.querySelectorAll<HTMLVideoElement>('video[data-mp4]')];
  if (!videos.length) return;
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('.motion')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  const inView = new Set<HTMLVideoElement>();
  let paused = false;
  try {
    paused = localStorage.getItem(STORAGE_KEY) === 'paused';
  } catch {
    // storage unavailable: motion stays on
  }

  const shouldPlay = (video: HTMLVideoElement) =>
    inView.has(video) &&
    !saveData &&
    !document.hidden &&
    (reducedMotion.matches ? hoverBox(video).matches(':hover, :focus-within') : !paused);
  const sync = (video: HTMLVideoElement) => {
    if (shouldPlay(video)) {
      attachSources(video);
      video.play().catch(() => {});
    } else if (!video.paused) video.pause();
  };
  const syncAll = () => videos.forEach(sync);

  const observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const video = e.target as HTMLVideoElement;
        if (e.isIntersecting) inView.add(video);
        else inView.delete(video);
        sync(video);
      }
    },
    { rootMargin: '200px', threshold: 0.25 },
  );
  for (const video of videos) {
    observer.observe(video);
    const box = hoverBox(video);
    for (const type of ['mouseenter', 'mouseleave', 'focusin', 'focusout'])
      box.addEventListener(type, () => reducedMotion.matches && sync(video));
  }

  // Under reduced motion nothing plays on its own, so there is nothing to pause: the control stays hidden (it would
  // say "Pause videos" over still posters). So it does under Save-Data.
  const label = () => {
    for (const b of buttons) {
      b.textContent = paused ? 'Play videos' : 'Pause videos';
      b.hidden = reducedMotion.matches || saveData;
    }
  };
  for (const b of buttons) {
    b.addEventListener('click', () => {
      paused = !paused;
      try {
        localStorage.setItem(STORAGE_KEY, paused ? 'paused' : 'on');
      } catch {
        // storage unavailable: the choice lasts for this page only
      }
      label();
      syncAll();
    });
  }
  label();
  reducedMotion.addEventListener('change', () => {
    label();
    syncAll();
  });
  document.addEventListener('visibilitychange', syncAll);
}
