export function Player({ tracks }: { tracks: Array<{ artist: string; title: string; previewUrl: string; show: unknown }> }) {
  return (
    <ul>
      {tracks.map((t, i) => (<li key={i}>{t.artist} — {t.title}</li>))}
    </ul>
  );
}
