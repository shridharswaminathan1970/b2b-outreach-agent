// Template variable handling. Variables use {{ name }} / {{name}} syntax with
// dotted paths allowed (e.g. {{ account.name }}).
const VARIABLE_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

// Return the unique, ordered list of variable names referenced in the text(s).
export function extractVariables(...texts: Array<string | null | undefined>): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(VARIABLE_RE)) {
      found.add(match[1]);
    }
  }
  return [...found];
}

export interface RenderResult {
  output: string;
  missing: string[]; // variables referenced but absent from data
}

// Substitute {{var}} occurrences using `data`. Unknown variables are left as
// their original placeholder and reported in `missing`.
export function renderTemplate(
  text: string | null | undefined,
  data: Record<string, string | number | boolean>,
): RenderResult {
  const missing = new Set<string>();
  if (!text) return { output: '', missing: [] };

  const output = text.replace(VARIABLE_RE, (placeholder, name: string) => {
    if (Object.prototype.hasOwnProperty.call(data, name)) {
      return String(data[name]);
    }
    missing.add(name);
    return placeholder;
  });

  return { output, missing: [...missing] };
}
