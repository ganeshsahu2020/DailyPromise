export function makeIdemKey(game: string, segment: number, d = new Date()) {
  const day = d.toISOString().slice(0, 10);
  return `${game}:${day}:seg:${segment}`;
}
