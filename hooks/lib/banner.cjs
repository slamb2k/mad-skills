'use strict';

const config = require('./config.cjs');

// Unicode banner (Nancyj-Fancy) — used when the terminal supports UTF-8.
// prettier-ignore
const BANNER_UNICODE = [
  "M\"\"\"\"\"`'\"\"\"`YM MMP\"\"\"\"\"\"\"MM M\"\"\"\"\"\"'YMM",
  "M  mm.  mm.  M M' .mmmm  MM M  mmmm. `M",
  "M  MMM  MMM  M M         `M M  MMMMM  M",
  "M  MMM  MMM  M M  MMMMM  MM M  MMMMM  M",
  "M  MMM  MMM  M M  MMMMM  MM M  MMMM' .M",
  "M  MMM  MMM  M M  MMMMM  MM M       .MM",
  "MMMMMMMMMMMMMM MMMMMMMMMMMM MMMMMMMMMMM",
  "",
  "MP\"\"\"\"\"\"`MM M\"\"MMMMM\"\"M M\"\"M M\"\"MMMMMMMM M\"\"MMMMMMMM MP\"\"\"\"\"\"`MM",
  "M  mmmmm..M M  MMMM' .M M  M M  MMMMMMMM M  MMMMMMMM M  mmmmm..M",
  "M.      `YM M       .MM M  M M  MMMMMMMM M  MMMMMMMM M.      `YM",
  "MMMMMMM.  M M  MMMb. YM M  M M  MMMMMMMM M  MMMMMMMM MMMMMMM.  M",
  "M. .MMM'  M M  MMMMb  M M  M M  MMMMMMMM M  MMMMMMMM M. .MMM'  M",
  "Mb.     .dM M  MMMMM  M M  M M         M M         M Mb.     .dM",
  "MMMMMMMMMMM MMMMMMMMMMM MMMM MMMMMMMMMMM MMMMMMMMMMM MMMMMMMMMMM",
];

// ASCII fallback (Rowan Cap) — used when the terminal locale is not UTF-8.
// prettier-ignore
const BANNER_ASCII = [
  "    dMMMMMMMMb  .aMMMb  dMMMMb",
  "   dMP\"dMP\"dMP dMP\"dMP dMP VMP",
  "  dMP dMP dMP dMMMMMP dMP dMP",
  " dMP dMP dMP dMP dMP dMP.aMP",
  "dMP dMP dMP dMP dMP dMMMMP\"",
  "",
  "   .dMMMb  dMP dMP dMP dMP     dMP    .dMMMb",
  "  dMP\" VP dMP.dMP amr dMP     dMP    dMP\" VP",
  "  VMMMb  dMMMMK\" dMP dMP     dMP     VMMMb",
  "dP .dMP dMP\"AMF dMP dMP     dMP    dP .dMP",
  "VMMMP\" dMP dMP dMP dMMMMMP dMMMMMP VMMMP\"",
];

// True when the terminal locale advertises UTF-8, so box-drawing glyphs render.
function supportsUnicode() {
  const locale = process.env.LC_ALL || process.env.LC_CTYPE || process.env.LANG || '';
  return /utf-?8/i.test(locale);
}

function getBanner() {
  const unicode = supportsUnicode();
  const lines = unicode ? BANNER_UNICODE : BANNER_ASCII;
  const separator = (unicode ? '─' : '-').repeat(70);
  return [
    ...lines,
    separator,
    ` Session Guard v${config.version}`,
    separator,
  ].join('\n');
}

module.exports = { getBanner, supportsUnicode, BANNER_MARKER: 'Session Guard' };
