// Reflow only freshly transcribed text. Edits made in the typing box stay untouched.
export function reflowTranscript(text) {
  return text.replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n(?:[ \t]*\n)*/)
    .map((paragraph) => paragraph.replace(/[ \t]*\n[ \t]*/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}
