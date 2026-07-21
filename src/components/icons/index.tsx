import type { SVGProps } from 'react';

/**
 * Transport / affordance glyphs as inline SVG — the two-ink discipline pass.
 *
 * The Unicode control glyphs these replace (▶ ❚❚ ⏭ ♥ ♡) are codepoints iOS
 * Safari promotes to MULTICOLOUR emoji (Apple blue/red), which punches straight
 * through the strict two-riso-ink palette. Drawn as paths instead, they carry NO
 * colour of their own: every icon fills via `currentColor`, so the button's
 * existing `color` (a globals.css token — --ink / --admission / --riso-pink /
 * --ash …) drives the ink, exactly as it did for the text glyph.
 *
 * Size follows the font, not a hardcoded box: width/height default to `1em`, so
 * the button's text-size class (text-sm / text-lg / text-xs) keeps sizing them
 * unchanged. Every icon is aria-hidden — the wrapping button owns the label.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Play — a filled triangle pointing right. */
export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 5v14l11-7z" />
    </Icon>
  );
}

/** Pause — two upright bars. */
export function PauseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </Icon>
  );
}

/** Skip / next — a triangle butted against a trailing bar. */
export function SkipNextIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
    </Icon>
  );
}

/** Heart, filled — the hearted state. */
export function HeartFilledIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </Icon>
  );
}

/** Heart, outline — the un-hearted state (a filled path drawing a ring). */
export function HeartOutlineIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z" />
    </Icon>
  );
}
