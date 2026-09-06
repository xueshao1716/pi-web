import { hexToHsl, buildTokens } from './theme.js';
console.log('hexToHsl("#E8683A") =', JSON.stringify(hexToHsl('#E8683A')));
console.log('primary =', buildTokens('#E8683A', false)['--tf-primary']);
console.log('hexToHsl("#00A884") =', JSON.stringify(hexToHsl('#00A884')));
console.log('primary2 =', buildTokens('#00A884', false)['--tf-primary']);
