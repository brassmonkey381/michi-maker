// THE NAMED BINDERS, as src/data/binderPresets.ts has them. This file exists because the share
// image runs as plain Node and cannot import the TypeScript; pageStyle.test.ts checks the two
// lists are identical, so edit both together.
module.exports = [
  { id: 'classic-white', label: 'Classic White', cloth: '#f4f4f4', zip: null, zipper: true, spine: 'cross' },
  {
    id: 'anniversary-gold',
    label: 'Anniversary Gold',
    cloth: '#efeeea',
    zip: { tape: '#d9bd6f', tooth: '#c9a24e', lit: '#f3dd92', slider: '#d4af37', sliderEdge: '#8a6d1f', pull: '#d4af37' },
    zipper: true,
    spine: 'cross',
  },
  { id: 'midnight-black', label: 'Midnight Black', cloth: '#0d0d10', zip: null, zipper: true, spine: 'cross' },
  { id: 'navy', label: 'Navy', cloth: '#1b2a4a', zip: null, zipper: true, spine: 'cross' },
  { id: 'forest', label: 'Forest', cloth: '#1f3b2c', zip: null, zipper: true, spine: 'ribbed' },
  { id: 'crimson', label: 'Crimson', cloth: '#6b1d24', zip: null, zipper: true, spine: 'cross' },
];
