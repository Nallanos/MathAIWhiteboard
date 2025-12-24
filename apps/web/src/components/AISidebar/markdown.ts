export function normalizeMathDelimiters(input: string): string {
  let text = input;

  // Convert fenced math/latex blocks to KaTeX-friendly block math.
  // Gemini sometimes emits ```latex ...``` or ```math ...```.
  text = text.replace(/```(?:latex|math)\s*([\s\S]*?)```/gi, (_m, inner) => {
    const body = String(inner ?? '').trim();
    return body ? `$$\n${body}\n$$` : '';
  });

  // Convert \[ ... \] to $$ ... $$
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner) => {
    const body = String(inner ?? '').trim();
    return body ? `$$\n${body}\n$$` : '';
  });

  // Convert \( ... \) to $ ... $
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner) => {
    const body = String(inner ?? '').trim();
    return body ? `$${body}$` : '';
  });

  // Wrap standalone LaTeX environments if they appear as plain text.
  // This helps when the model outputs \begin{aligned}...\end{aligned} without delimiters.
  text = text.replace(
    /(^|\n)(\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\})(?=\n|$)/g,
    (_m, prefix, env) => `${prefix}$$\n${String(env).trim()}\n$$`
  );

  return text;
}
