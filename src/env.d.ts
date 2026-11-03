// Astro's JSX types know `disableremoteplayback` only by its DOM property name (disableRemotePlayback); the markup uses
// the lowercase HTML attribute, as it does for `disablepictureinpicture`.
declare namespace astroHTML.JSX {
  interface VideoHTMLAttributes {
    disableremoteplayback?: boolean | string | undefined | null;
  }
}
