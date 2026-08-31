/** Lucide SVG icons for Vditor toolbar — no inline sizing, CSS controls size */
const s = (d: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${d}</svg>`

export const toolbarIcons: Record<string, string> = {
  headings: s('<path d="M6 12h12"/><path d="M6 20V4"/><path d="M18 20V4"/>'),
  bold: s('<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>'),
  italic: s('<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>'),
  strike: s('<path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" x2="20" y1="12" y2="12"/>'),
  quote: s('<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>'),
  list: s('<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/>'),
  'ordered-list': s('<path d="M11 12h9"/><path d="M11 18h9"/><path d="M11 6h9"/><path d="M4 16c0 .5.2 1 .6 1.4l1.9 1.6H3.5"/><path d="M3.5 16H6"/><path d="M4 4.5 5.5 3H6v4.5"/><path d="M3.5 7.5H6"/>'),
  check: s('<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>'),
  code: s('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
  'inline-code': s('<path d="m16 18 2-2-2-2"/><path d="m8 18-2-2 2-2"/><path d="m10 10 4 4"/>'),
  link: s('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
  table: s('<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>'),
  upload: s('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>'),
  line: s('<path d="M5 12h14"/>'),
  emoji: s('<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>'),
  'font-color': s('<path d="M4 20h16"/><path d="m5.5 16 6.5-14 6.5 14"/><path d="M8.3 12h7.4"/>'),
}
