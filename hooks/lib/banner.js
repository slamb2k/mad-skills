'use strict';

const config = require('./config');

// prettier-ignore
const BANNER_LINES = [
  'M"""""`\'"""`YM                dP    MP""""""`MM dP       oo dP dP',
  'M  mm.  mm.  M                88    M  mmmmm..M 88          88 88',
  'M  MMM  MMM  M .d8888b. .d888b88    M.      `YM 88  .dP  dP 88 88 .d8888b.',
  'M  MMM  MMM  M 88\'  `88 88\'  `88    MMMMMMM.  M 88888"   88 88 88 Y8ooooo.',
  'M  MMM  MMM  M 88.  .88 88.  .88    M. .MMM\'  M 88  `8b. 88 88 88       88',
  'M  MMM  MMM  M `88888P8 `88888P8    Mb.     .dM dP   `YP dP dP dP `88888P\'',
  'MMMMMMMMMMMMMM                      MMMMMMMMMMM',
];

const SEPARATOR = '\u2500'.repeat(70);

function getBanner() {
  return [
    ...BANNER_LINES,
    SEPARATOR,
    ` Session Guard v${config.version}`,
    SEPARATOR,
  ].join('\n');
}

module.exports = { getBanner, BANNER_MARKER: 'MMMMMMMMMMMMMM' };
