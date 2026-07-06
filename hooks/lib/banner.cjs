'use strict';

const config = require('./config.cjs');

// Unicode banner (Delta Corps Priest 1) — used when the terminal supports UTF-8.
// prettier-ignore
const BANNER_UNICODE = [
  "  ▄▄▄▄███▄▄▄▄      ▄████████ ████████▄",
  "▄██▀▀▀███▀▀▀██▄   ███    ███ ███   ▀███",
  "███   ███   ███   ███    ███ ███    ███",
  "███   ███   ███   ███    ███ ███    ███",
  "███   ███   ███ ▀███████████ ███    ███",
  "███   ███   ███   ███    ███ ███    ███",
  "███   ███   ███   ███    ███ ███   ▄███",
  " ▀█   ███   █▀    ███    █▀  ████████▀",
  "",
  "   ▄████████    ▄█   ▄█▄  ▄█   ▄█        ▄█          ▄████████",
  "  ███    ███   ███ ▄███▀ ███  ███       ███         ███    ███",
  "  ███    █▀    ███▐██▀   ███▌ ███       ███         ███    █▀",
  "  ███         ▄█████▀    ███▌ ███       ███         ███",
  "▀███████████ ▀▀█████▄    ███▌ ███       ███       ▀███████████",
  "         ███   ███▐██▄   ███  ███       ███                ███",
  "   ▄█    ███   ███ ▀███▄ ███  ███▌    ▄ ███▌    ▄    ▄█    ███",
  " ▄████████▀    ███   ▀█▀ █▀   █████▄▄██ █████▄▄██  ▄████████▀",
  "               ▀              ▀         ▀",
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
