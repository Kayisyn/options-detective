// Tiny class-name combiner; keeps component variant maps readable.
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
