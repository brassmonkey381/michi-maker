/**
 * Trainer → partner-Pokémon knowledge, curated. Powers the composer's "Trainer page"
 * (michi Trainer method): a trainer's supporter/owned cards + their signature Pokémon + the
 * rest of their canonical team on one page.
 *
 * Shape notes:
 *  - `signature` — the partner(s) the trainer is famous for; first entry is THE one.
 *  - `pokemon`   — other Pokémon they canonically own, vibe with, or are strongly associated
 *                  with (games/anime/TCG). Looser than "owns" on purpose.
 *  - `associates`— other trainers they're canonically linked with (future: cross-trainer pages).
 *  - `tokens`    — name-match overrides for risky short names ("N" only matches "N's …").
 *
 * All species/trainer strings are lowercase match tokens (regional prefixes omitted so
 * "vulpix" matches "Alolan Vulpix"). This table is deliberately plain data — it is slated to
 * move upstream into the tcgscan-data server (a `trainer_partners` table) along with the
 * pokemon-partner map; keep it JSON-serializable and free of app imports.
 */
import { hasToken } from '@/data/nameMatch';

export interface TrainerEntry {
  /** Canonical display name, e.g. "Misty". */
  name: string;
  /** Iconic partner(s), most famous first. */
  signature: string[];
  /** Other canonical team members / associations. */
  pokemon: string[];
  /** Trainers they're canonically linked with. */
  associates?: string[];
  /** Name-match overrides (defaults to the lowercase name). */
  tokens?: string[];
}

export const TRAINER_PARTNERS: TrainerEntry[] = [
  // --- protagonists & rivals -------------------------------------------------
  { name: 'Ash', signature: ['pikachu'], pokemon: ['charizard', 'greninja', 'lucario', 'snorlax', 'bulbasaur', 'squirtle', 'rowlet', 'dragonite'], associates: ['misty', 'brock', 'goh'], tokens: ["ash's"] },
  { name: 'Red', signature: ['charizard'], pokemon: ['pikachu', 'venusaur', 'blastoise', 'snorlax', 'espeon'], associates: ['blue'], tokens: ["red's"] },
  { name: 'Blue', signature: ['blastoise'], pokemon: ['eevee', 'alakazam', 'pidgeot', 'arcanine', 'exeggutor'], associates: ['red', 'professor oak'], tokens: ["blue's"] },
  { name: 'Gary', signature: ['umbreon'], pokemon: ['blastoise', 'electivire', 'nidoking'], associates: ['ash', 'professor oak'], tokens: ["gary's"] },
  { name: 'Ethan', signature: ['typhlosion'], pokemon: ['cyndaquil', 'togetic', 'sudowoodo'], associates: ['silver'] },
  { name: 'Silver', signature: ['feraligatr'], pokemon: ['sneasel', 'crobat', 'gengar'], associates: ['ethan', 'giovanni'], tokens: ["silver's"] },
  { name: 'May', signature: ['blaziken'], pokemon: ['beautifly', 'skitty', 'glaceon', 'wartortle'], associates: ['brendan'], tokens: ["may's"] },
  { name: 'Brendan', signature: ['sceptile'], pokemon: ['swampert', 'aggron'], associates: ['may'] },
  { name: 'Dawn', signature: ['piplup'], pokemon: ['empoleon', 'buneary', 'togekiss', 'mamoswine', 'quilava'], associates: ['ash', 'cynthia'], tokens: ["dawn's"] },
  { name: 'Hilbert', signature: ['emboar'], pokemon: ['oshawott', 'snivy'], associates: ['n', 'bianca', 'cheren'] },
  { name: 'Serena', signature: ['delphox'], pokemon: ['braixen', 'sylveon', 'pancham'], associates: ['ash'] },
  { name: 'Calem', signature: ['greninja'], pokemon: ['chesnaught', 'absol'], associates: ['serena'] },
  { name: 'Gladion', signature: ['silvally'], pokemon: ['weavile', 'lucario', 'zoroark', 'crobat'], associates: ['lillie', 'lusamine'] },
  { name: 'Hau', signature: ['raichu'], pokemon: ['decidueye', 'crabominable'], associates: ['hala'] },
  { name: 'Hop', signature: ['dubwool'], pokemon: ['corviknight', 'snorlax', 'zamazenta', 'rillaboom'], associates: ['leon', 'gloria'] },
  { name: 'Gloria', signature: ['zacian'], pokemon: ['cinderace', 'inteleon', 'rillaboom'], associates: ['hop', 'leon'] },
  { name: 'Bianca', signature: ['emboar'], pokemon: ['musharna', 'stoutland', 'mincinno'], associates: ['cheren', 'hilbert'] },
  { name: 'Cheren', signature: ['stoutland'], pokemon: ['serperior', 'liepard', 'unfezant'], associates: ['bianca', 'hilbert'] },
  { name: 'Goh', signature: ['cinderace'], pokemon: ['grookey', 'suicune', 'inteleon'], associates: ['ash'] },
  { name: 'Chloe', signature: ['eevee'], pokemon: ['yamper'], associates: ['goh', 'ash'] },
  { name: 'Wally', signature: ['gallade'], pokemon: ['ralts', 'flygon', 'altaria'], associates: ['brendan'], tokens: ["wally's", 'wally'] },
  { name: 'Nemona', signature: ['pawmot'], pokemon: ['lycanroc', 'meowscarada', 'quaquaval', 'skeledirge'], associates: ['penny', 'arven'] },
  { name: 'Arven', signature: ['mabosstiff'], pokemon: ['greedent', 'scovillain', 'toedscruel'], associates: ['nemona', 'penny'] },
  { name: 'Penny', signature: ['sylveon'], pokemon: ['umbreon', 'vaporeon', 'jolteon', 'flareon', 'leafeon', 'glaceon', 'espeon'], associates: ['nemona', 'arven'] },

  // --- kanto gym leaders + elite --------------------------------------------
  { name: 'Brock', signature: ['onix'], pokemon: ['geodude', 'vulpix', 'crobat', 'steelix', 'sudowoodo'], associates: ['ash', 'misty'], tokens: ["brock's", 'brock'] },
  { name: 'Misty', signature: ['starmie'], pokemon: ['staryu', 'psyduck', 'gyarados', 'togepi', 'goldeen', 'corsola'], associates: ['ash', 'brock'], tokens: ["misty's", 'misty'] },
  { name: 'Lt. Surge', signature: ['raichu'], pokemon: ['electabuzz', 'magnemite', 'voltorb', 'pikachu'], tokens: ["lt. surge's", 'lt. surge'] },
  { name: 'Erika', signature: ['vileplume'], pokemon: ['tangela', 'exeggutor', 'bellossom', 'gloom', 'comfey'], tokens: ["erika's", 'erika'] },
  { name: 'Koga', signature: ['weezing'], pokemon: ['muk', 'golbat', 'venomoth', 'ditto', 'crobat'], associates: ['janine'], tokens: ["koga's", 'koga'] },
  { name: 'Janine', signature: ['crobat'], pokemon: ['ariados', 'venomoth', 'weezing'], associates: ['koga'] },
  { name: 'Sabrina', signature: ['alakazam'], pokemon: ['abra', 'mr. mime', 'espeon', 'gengar'], tokens: ["sabrina's", 'sabrina'] },
  { name: 'Blaine', signature: ['arcanine'], pokemon: ['magmar', 'ninetales', 'rapidash', 'growlithe'], tokens: ["blaine's", 'blaine'] },
  { name: 'Giovanni', signature: ['persian'], pokemon: ['nidoking', 'nidoqueen', 'rhydon', 'mewtwo', 'rhyperior'], associates: ['jessie', 'james', 'silver'], tokens: ["giovanni's", 'giovanni'] },
  { name: 'Lorelei', signature: ['lapras'], pokemon: ['dewgong', 'jynx', 'cloyster', 'slowbro'], tokens: ["lorelei's", 'lorelei'] },
  { name: 'Bruno', signature: ['machamp'], pokemon: ['hitmonlee', 'hitmonchan', 'onix', 'poliwrath'], tokens: ["bruno's", 'bruno'] },
  { name: 'Agatha', signature: ['gengar'], pokemon: ['golbat', 'haunter', 'arbok'], tokens: ["agatha's", 'agatha'] },
  { name: 'Lance', signature: ['dragonite'], pokemon: ['gyarados', 'dragonair', 'aerodactyl', 'charizard'], tokens: ["lance's", 'lance'] },

  // --- team rocket ------------------------------------------------------------
  { name: 'Jessie', signature: ['wobbuffet'], pokemon: ['arbok', 'ekans', 'seviper', 'yanmega', 'gourgeist', 'lickitung'], associates: ['james', 'giovanni'], tokens: ["jessie's", 'jessie'] },
  { name: 'James', signature: ['weezing'], pokemon: ['koffing', 'growlithe', 'victreebel', 'cacnea', 'inkay', 'mareanie'], associates: ['jessie', 'giovanni'], tokens: ["james's", "james'", 'james'] },

  // --- johto ------------------------------------------------------------------
  { name: 'Falkner', signature: ['pidgeot'], pokemon: ['pidgeotto', 'noctowl', 'dodrio'] },
  { name: 'Bugsy', signature: ['scyther'], pokemon: ['scizor', 'yanma', 'heracross'] },
  { name: 'Whitney', signature: ['miltank'], pokemon: ['clefairy', 'wigglytuff', 'girafarig'] },
  { name: 'Morty', signature: ['gengar'], pokemon: ['haunter', 'misdreavus', 'mismagius', 'drifblim'], associates: ['eusine'] },
  { name: 'Chuck', signature: ['poliwrath'], pokemon: ['primeape', 'machoke', 'breloom'] },
  { name: 'Jasmine', signature: ['steelix'], pokemon: ['ampharos', 'magnemite', 'togetic'], tokens: ["jasmine's", 'jasmine'] },
  { name: 'Pryce', signature: ['piloswine'], pokemon: ['dewgong', 'seel', 'mamoswine', 'abomasnow'] },
  { name: 'Clair', signature: ['kingdra'], pokemon: ['dragonair', 'gyarados', 'dragonite'], associates: ['lance'] },
  { name: 'Karen', signature: ['umbreon'], pokemon: ['houndoom', 'murkrow', 'gengar', 'vileplume'] },
  { name: 'Will', signature: ['xatu'], pokemon: ['jynx', 'slowbro', 'exeggutor'] },
  { name: 'Eusine', signature: ['suicune'], pokemon: ['drowzee', 'haunter', 'electrode'], associates: ['morty'] },

  // --- hoenn ------------------------------------------------------------------
  { name: 'Roxanne', signature: ['nosepass'], pokemon: ['probopass', 'geodude', 'golem'] },
  { name: 'Brawly', signature: ['makuhita'], pokemon: ['hariyama', 'machop', 'meditite'] },
  { name: 'Wattson', signature: ['manectric'], pokemon: ['magneton', 'voltorb', 'electrike'] },
  { name: 'Flannery', signature: ['torkoal'], pokemon: ['numel', 'camerupt', 'slugma'] },
  { name: 'Norman', signature: ['slaking'], pokemon: ['vigoroth', 'spinda', 'slakoth'], associates: ['may'] },
  { name: 'Winona', signature: ['altaria'], pokemon: ['skarmory', 'pelipper', 'swellow', 'swablu'] },
  { name: 'Tate & Liza', signature: ['solrock', 'lunatone'], pokemon: ['claydol', 'xatu'], tokens: ['tate & liza', "tate's", "liza's"] },
  { name: 'Wallace', signature: ['milotic'], pokemon: ['wailord', 'whiscash', 'gyarados', 'ludicolo'], associates: ['steven', 'winona'] },
  { name: 'Steven', signature: ['metagross'], pokemon: ['beldum', 'skarmory', 'aggron', 'cradily', 'armaldo'], associates: ['wallace'], tokens: ["steven's", 'steven'] },
  { name: 'Phoebe', signature: ['dusknoir'], pokemon: ['dusclops', 'banette', 'sableye'] },
  { name: 'Drake', signature: ['salamence'], pokemon: ['shelgon', 'altaria', 'flygon', 'kingdra'], tokens: ["drake's", 'drake'] },
  { name: 'Glacia', signature: ['walrein'], pokemon: ['glalie', 'froslass', 'sealeo'] },
  { name: 'Sidney', signature: ['absol'], pokemon: ['mightyena', 'shiftry', 'sharpedo', 'cacturne'] },
  { name: 'Maxie', signature: ['groudon'], pokemon: ['camerupt', 'mightyena', 'crobat'], associates: ['archie'], tokens: ["maxie's", 'maxie'] },
  { name: 'Archie', signature: ['kyogre'], pokemon: ['sharpedo', 'mightyena', 'crobat'], associates: ['maxie'], tokens: ["archie's", 'archie'] },
  { name: 'Zinnia', signature: ['rayquaza'], pokemon: ['salamence', 'whismur', 'goodra', 'altaria'] },

  // --- sinnoh -----------------------------------------------------------------
  { name: 'Roark', signature: ['rampardos'], pokemon: ['cranidos', 'onix', 'geodude'], associates: ['byron'] },
  { name: 'Gardenia', signature: ['roserade'], pokemon: ['cherubi', 'turtwig', 'cherrim', 'tangrowth'] },
  { name: 'Maylene', signature: ['lucario'], pokemon: ['meditite', 'machoke', 'riolu'] },
  { name: 'Crasher Wake', signature: ['floatzel'], pokemon: ['gyarados', 'quagsire', 'buizel'], tokens: ['crasher wake', "wake's"] },
  { name: 'Fantina', signature: ['mismagius'], pokemon: ['drifblim', 'gengar', 'duskull'] },
  { name: 'Byron', signature: ['bastiodon'], pokemon: ['bronzor', 'steelix', 'magneton'], associates: ['roark'] },
  { name: 'Candice', signature: ['froslass'], pokemon: ['abomasnow', 'sneasel', 'piloswine', 'snover'] },
  { name: 'Volkner', signature: ['luxray'], pokemon: ['electivire', 'raichu', 'jolteon', 'octillery'], associates: ['flint'] },
  { name: 'Flint', signature: ['infernape'], pokemon: ['rapidash', 'magmortar', 'houndoom', 'flareon'], associates: ['volkner'], tokens: ["flint's", 'flint'] },
  { name: 'Cynthia', signature: ['garchomp'], pokemon: ['spiritomb', 'milotic', 'lucario', 'roserade', 'togekiss', 'gible'], associates: ['dawn'], tokens: ["cynthia's", 'cynthia'] },
  { name: 'Cyrus', signature: ['weavile'], pokemon: ['crobat', 'honchkrow', 'gyarados', 'dialga', 'palkia'], tokens: ["cyrus's", "cyrus'", 'cyrus'] },
  { name: 'Volo', signature: ['giratina'], pokemon: ['togepi', 'spiritomb', 'garchomp', 'lucario', 'roserade'], tokens: ["volo's", 'volo'] },
  { name: 'Adaman', signature: ['leafeon'], pokemon: ['dialga', 'vaporeon'], associates: ['irida'] },
  { name: 'Irida', signature: ['glaceon'], pokemon: ['palkia', 'espeon'], associates: ['adaman'] },

  // --- unova ------------------------------------------------------------------
  { name: 'Elesa', signature: ['zebstrika'], pokemon: ['emolga', 'tynamo', 'eelektross', 'blitzle'] },
  { name: 'Clay', signature: ['excadrill'], pokemon: ['krokorok', 'palpitoad', 'golurk'] },
  { name: 'Skyla', signature: ['swanna'], pokemon: ['unfezant', 'swoobat', 'ducklett'] },
  { name: 'Drayden', signature: ['haxorus'], pokemon: ['druddigon', 'fraxure'], associates: ['iris'] },
  { name: 'Roxie', signature: ['scolipede'], pokemon: ['koffing', 'whirlipede', 'garbodor'] },
  { name: 'Marlon', signature: ['jellicent'], pokemon: ['carracosta', 'wailord', 'mantine'] },
  { name: 'Iris', signature: ['haxorus'], pokemon: ['dragonite', 'axew', 'excadrill', 'emolga'], associates: ['drayden', 'ash'], tokens: ["iris's", "iris'", 'iris'] },
  { name: 'Alder', signature: ['volcarona'], pokemon: ['bouffalant', 'escavalier', 'accelgor'], tokens: ["alder's", 'alder'] },
  { name: 'N', signature: ['zoroark'], pokemon: ['reshiram', 'zekrom', 'zorua', 'sigilyph', 'klinklang'], associates: ['hilbert', 'ghetsis'], tokens: ["n's"] },
  { name: 'Ghetsis', signature: ['hydreigon'], pokemon: ['cofagrigus', 'eelektross', 'kyurem'], associates: ['n'], tokens: ["ghetsis's", "ghetsis'", 'ghetsis'] },
  { name: 'Colress', signature: ['klinklang'], pokemon: ['magnezone', 'metang', 'beheeyem'], tokens: ["colress's", "colress'", 'colress'] },

  // --- kalos ------------------------------------------------------------------
  { name: 'Viola', signature: ['vivillon'], pokemon: ['surskit', 'masquerain'] },
  { name: 'Grant', signature: ['tyrunt'], pokemon: ['amaura', 'aurorus', 'tyrantrum'], tokens: ["grant's", 'grant'] },
  { name: 'Korrina', signature: ['lucario'], pokemon: ['hawlucha', 'mienfoo', 'machoke', 'riolu'] },
  { name: 'Ramos', signature: ['gogoat'], pokemon: ['jumpluff', 'weepinbell'] },
  { name: 'Clemont', signature: ['luxray'], pokemon: ['bunnelby', 'chespin', 'dedenne', 'heliolisk', 'magneton'], associates: ['ash', 'serena'] },
  { name: 'Valerie', signature: ['sylveon'], pokemon: ['spritzee', 'mawile', 'mr. mime'] },
  { name: 'Olympia', signature: ['meowstic'], pokemon: ['sigilyph', 'slowking'] },
  { name: 'Wulfric', signature: ['avalugg'], pokemon: ['cryogonal', 'abomasnow', 'bergmite'] },
  { name: 'Diantha', signature: ['gardevoir'], pokemon: ['hawlucha', 'aurorus', 'gourgeist', 'goodra', 'tyrantrum'], tokens: ["diantha's", 'diantha'] },
  { name: 'Lysandre', signature: ['pyroar'], pokemon: ['gyarados', 'mienshao', 'honchkrow', 'yveltal'], tokens: ["lysandre's", 'lysandre'] },
  { name: 'Professor Sycamore', signature: ['garchomp'], pokemon: ['charmander', 'squirtle', 'bulbasaur'], tokens: ['professor sycamore', "sycamore's", 'sycamore'] },

  // --- alola ------------------------------------------------------------------
  { name: 'Ilima', signature: ['gumshoos'], pokemon: ['smeargle', 'eevee', 'yungoos'] },
  { name: 'Lana', signature: ['primarina'], pokemon: ['popplio', 'wishiwashi', 'araquanid', 'lapras'], associates: ['mallow', 'kiawe'] },
  { name: 'Kiawe', signature: ['turtonator'], pokemon: ['marowak', 'charizard', 'magmar'], associates: ['lana', 'mallow'] },
  { name: 'Mallow', signature: ['tsareena'], pokemon: ['steenee', 'bounsweet', 'shiinotic'], associates: ['lana', 'kiawe'] },
  { name: 'Sophocles', signature: ['togedemaru'], pokemon: ['vikavolt', 'charjabug', 'magnemite'] },
  { name: 'Acerola', signature: ['mimikyu'], pokemon: ['palossand', 'drifloon', 'sableye', 'shuppet'], tokens: ["acerola's", 'acerola'] },
  { name: 'Mina', signature: ['ribombee'], pokemon: ['granbull', 'wigglytuff', 'cutiefly'] },
  { name: 'Hala', signature: ['hariyama'], pokemon: ['crabominable', 'primeape', 'machamp'], associates: ['hau'] },
  { name: 'Olivia', signature: ['lycanroc'], pokemon: ['midnight lycanroc', 'nosepass', 'carbink', 'probopass'], tokens: ["olivia's", 'olivia'] },
  { name: 'Nanu', signature: ['persian'], pokemon: ['sableye', 'krookodile', 'honchkrow'] },
  { name: 'Hapu', signature: ['mudsdale'], pokemon: ['golurk', 'flygon', 'gastrodon'] },
  { name: 'Kukui', signature: ['incineroar'], pokemon: ['braviary', 'lycanroc', 'empoleon', 'venusaur'], associates: ['ash', 'burnet'], tokens: ["kukui's", 'professor kukui', 'kukui'] },
  { name: 'Burnet', signature: ['munchlax'], pokemon: ['alakazam'], associates: ['kukui'], tokens: ["burnet's", 'professor burnet', 'burnet'] },
  { name: 'Lillie', signature: ['vulpix'], pokemon: ['clefairy', 'ribombee', 'magearna', 'cosmog'], associates: ['gladion', 'lusamine'], tokens: ["lillie's", 'lillie'] },
  { name: 'Lusamine', signature: ['bewear'], pokemon: ['clefable', 'milotic', 'mismagius', 'lilligant', 'nihilego'], associates: ['lillie', 'gladion'], tokens: ["lusamine's", 'lusamine'] },
  { name: 'Guzma', signature: ['golisopod'], pokemon: ['ariados', 'masquerain', 'pinsir', 'scizor', 'wimpod'], associates: ['plumeria'], tokens: ["guzma's", 'guzma'] },
  { name: 'Plumeria', signature: ['salazzle'], pokemon: ['golbat', 'salandit'], associates: ['guzma'] },

  // --- galar ------------------------------------------------------------------
  { name: 'Milo', signature: ['eldegoss'], pokemon: ['gossifleur', 'flapple'] },
  { name: 'Nessa', signature: ['drednaw'], pokemon: ['goldeen', 'arrokuda', 'barraskewda'], tokens: ["nessa's", 'nessa'] },
  { name: 'Kabu', signature: ['centiskorch'], pokemon: ['arcanine', 'ninetales', 'sizzlipede'] },
  { name: 'Bea', signature: ['machamp'], pokemon: ['hitmontop', 'falinks', 'grapploct', 'hawlucha'], tokens: ["bea's", 'bea'] },
  { name: 'Allister', signature: ['gengar'], pokemon: ['cursola', 'polteageist', 'yamask', 'mimikyu'], tokens: ["allister's", 'allister'] },
  { name: 'Opal', signature: ['alcremie'], pokemon: ['galarian weezing', 'weezing', 'mawile', 'togekiss'], associates: ['bede'], tokens: ["opal's", 'opal'] },
  { name: 'Gordie', signature: ['coalossal'], pokemon: ['barbaracle', 'stonjourner', 'shuckle'], associates: ['melony'] },
  { name: 'Melony', signature: ['lapras'], pokemon: ['frosmoth', 'eiscue', 'mr. rime'], associates: ['gordie'], tokens: ["melony's", 'melony'] },
  { name: 'Piers', signature: ['obstagoon'], pokemon: ['malamar', 'skuntank', 'toxtricity'], associates: ['marnie'], tokens: ["piers's", "piers'", 'piers'] },
  { name: 'Raihan', signature: ['duraludon'], pokemon: ['flygon', 'goodra', 'sandaconda', 'torkoal'], associates: ['leon'], tokens: ["raihan's", 'raihan'] },
  { name: 'Leon', signature: ['charizard'], pokemon: ['aegislash', 'dragapult', 'haxorus', 'rillaboom', 'cinderace'], associates: ['hop', 'raihan'], tokens: ["leon's", 'leon'] },
  { name: 'Marnie', signature: ['morpeko'], pokemon: ['liepard', 'grimmsnarl', 'scrafty', 'toxicroak'], associates: ['piers'], tokens: ["marnie's", 'marnie'] },
  { name: 'Bede', signature: ['hatterene'], pokemon: ['ponyta', 'gothitelle', 'rapidash', 'sylveon'], associates: ['opal'], tokens: ["bede's", 'bede'] },
  { name: 'Sonia', signature: ['yamper'], pokemon: ['boltund'], associates: ['leon', 'professor magnolia'], tokens: ["sonia's", 'sonia'] },
  { name: 'Rose', signature: ['copperajah'], pokemon: ['ferrothorn', 'perrserker', 'klinklang', 'eternatus'], tokens: ["rose's", 'rose'] },

  // --- paldea -----------------------------------------------------------------
  { name: 'Katy', signature: ['spidops'], pokemon: ['teddiursa', 'nymble', 'tarountula'] },
  { name: 'Brassius', signature: ['sudowoodo'], pokemon: ['petilil', 'smoliv', 'lilligant'] },
  { name: 'Iono', signature: ['bellibolt'], pokemon: ['wattrel', 'kilowattrel', 'luxray', 'mismagius'], tokens: ["iono's", 'iono'] },
  { name: 'Kofu', signature: ['veluza'], pokemon: ['wugtrio', 'bombirdier', 'crabominable'] },
  { name: 'Larry', signature: ['staraptor'], pokemon: ['dudunsparce', 'flamigo', 'komala', 'oricorio'], tokens: ["larry's", 'larry'] },
  { name: 'Ryme', signature: ['toxtricity'], pokemon: ['banette', 'mimikyu', 'houndstone'], tokens: ["ryme's", 'ryme'] },
  { name: 'Tulip', signature: ['florges'], pokemon: ['farigiraf', 'gardevoir', 'espathra'] },
  { name: 'Grusha', signature: ['cetitan'], pokemon: ['frosmoth', 'beartic', 'altaria'], tokens: ["grusha's", 'grusha'] },
  { name: 'Geeta', signature: ['glimmora'], pokemon: ['kingambit', 'espathra', 'gogoat', 'veluza'], tokens: ["geeta's", 'geeta'] },
  { name: 'Sada', signature: ['koraidon'], pokemon: [], associates: ['arven'], tokens: ["sada's", 'professor sada', 'sada'] },
  { name: 'Turo', signature: ['miraidon'], pokemon: [], associates: ['arven'], tokens: ["turo's", 'professor turo', 'turo'] },

  // --- professors & icons -------------------------------------------------------
  { name: 'Professor Oak', signature: ['tauros'], pokemon: ['dragonite', 'charmander', 'squirtle', 'bulbasaur'], associates: ['red', 'blue', 'ash'], tokens: ['professor oak', "oak's"] },
  { name: 'Professor Elm', signature: ['corsola'], pokemon: ['chikorita', 'cyndaquil', 'totodile'], associates: ['ethan'], tokens: ['professor elm', "elm's"] },
  { name: 'Professor Birch', signature: ['poochyena'], pokemon: ['treecko', 'torchic', 'mudkip'], associates: ['may', 'brendan'], tokens: ['professor birch', "birch's"] },
  { name: 'Professor Rowan', signature: ['staraptor'], pokemon: ['turtwig', 'chimchar', 'piplup'], associates: ['dawn'], tokens: ['professor rowan', "rowan's"] },
  { name: 'Professor Juniper', signature: ['accelgor'], pokemon: ['snivy', 'tepig', 'oshawott', 'mincinno'], tokens: ['professor juniper', "juniper's"] },
  { name: 'Professor Magnolia', signature: ['yamper'], pokemon: [], associates: ['sonia'], tokens: ['professor magnolia', "magnolia's"] },
];

/** Find the trainer a card name references, or null. Longest token wins across entries. */
export function trainerFor(cardName: string): TrainerEntry | null {
  const n = cardName.toLowerCase();
  let best: { entry: TrainerEntry; len: number } | null = null;
  for (const entry of TRAINER_PARTNERS) {
    for (const token of entry.tokens ?? [entry.name.toLowerCase()]) {
      if ((n === token || hasToken(n, token)) && (!best || token.length > best.len)) {
        best = { entry, len: token.length };
      }
    }
  }
  return best?.entry ?? null;
}
