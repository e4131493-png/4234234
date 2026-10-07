// Keep unknown settings, comments and newline style. Reject ambiguous duplicate keys.
function rows(text) { return text.split(/\r?\n/); }
function locate(text, section, key) {
  const lines = rows(text);
  let current = '', found = [];
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i].match(/^\s*\[([^\]]+)\]\s*$/);
    if (header) { current = header[1]; continue; }
    const pair = lines[i].match(/^\s*([^;#=\s][^=]*?)\s*=(.*)$/);
    if (current.toLowerCase() === section.toLowerCase() && pair?.[1].toLowerCase() === key.toLowerCase()) found.push(i);
  }
  if (found.length > 1) throw new Error(`Duplicate ${key} in [${section}]. Resolve it before applying a preset.`);
  return { lines, index: found[0] ?? -1 };
}
export function getValue(text, section, key) {
  const { lines, index } = locate(text, section, key);
  return index < 0 ? null : lines[index].slice(lines[index].indexOf('=') + 1).trim();
}
export function setValue(text, section, key, value) {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const { lines, index } = locate(text, section, key);
  if (index >= 0) {
    if (value === null) lines.splice(index, 1);
    else lines[index] = lines[index].slice(0, lines[index].indexOf('=') + 1) + value;
  } else if (value !== null) {
    let headerIndex = lines.findIndex(line => line.trim().toLowerCase() === `[${section}]`.toLowerCase());
    if (headerIndex < 0) {
      if (lines.at(-1) !== '') lines.push('');
      lines.push(`[${section}]`, `${key}=${value}`, '');
    } else {
      let end = headerIndex + 1;
      while (end < lines.length && !/^\s*\[/.test(lines[end])) end++;
      lines.splice(end, 0, `${key}=${value}`);
    }
  }
  return lines.join(newline);
}
export function planIni(text, desired) {
  const changes = [];
  let result = text;
  for (const [section, entries] of Object.entries(desired)) {
    for (const [key, after] of Object.entries(entries)) {
      const before = getValue(text, section, key);
      if (before !== after) {
        changes.push({ section, key, before, after });
        result = setValue(result, section, key, after);
      }
    }
  }
  return { result, changes };
}
export function restoreIni(text, changes) {
  const conflicts = changes.filter(c => {
    const now = getValue(text, c.section, c.key);
    return now !== c.after && now !== c.before;
  });
  if (conflicts.length) throw new Error(`Fortnite changed these settings since the backup: ${conflicts.map(c => c.key).join(', ')}. Restore was paused to protect your edits. Your original file is in the backup folder.`);
  return changes.reduce((current, c) => setValue(current, c.section, c.key, c.before), text);
}
