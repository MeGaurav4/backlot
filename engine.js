/*
 * Backlot — LocalEngine
 * A structured local generation engine for the Backlot multi-agent film studio.
 * It parses a one-line film idea, stages a capped five-agent debate whose
 * outcomes change the compiled outputs, and produces a treatment, a shot list,
 * storyboard frame prompts and previz SVG frames. Deterministic per idea:
 * the same line of input always stages the same argument, so a demo can be
 * rehearsed. No network, no dependencies.
 */
(function (root) {
  'use strict';

  /* ---------- deterministic randomness ---------- */

  function hashSeed(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function article(s) { return /^[aeiou]/i.test(s) ? 'an' : 'a'; }

  /* ---------- lexicons ---------- */

  var SETTINGS = [
    {
      id: 'coast',
      keys: ['lighthouse', 'harbour', 'harbor', 'coast', 'shore', 'sea', 'ocean', 'beach', 'cliff', 'tide', 'sailor', 'fishing boat', 'island'],
      place: 'a granite lighthouse point above a black sea',
      shortPlace: 'the lighthouse point',
      placeWord: 'the Point',
      interior: 'the watch room under the lamp',
      titleNoun: 'Lamp',
      palette: { name: 'lamp-black, sea green and sodium amber', sky: ['#0a1122', '#274b63'], sea: '#0d2436', ground: '#0c1218', accent: '#ffb454', paper: '#e8e2d2' },
      light: 'one rotating lamp and one oil lantern, nothing else allowed to glow',
      setPiece: 'the great storm night, the sea standing up in white walls around the point',
      cheapCut: 'we never go out into the storm. We hear it through the walls, and we see it only as foam on the lamp glass',
      signature: 'the lamp beam sweeping a full circle across an empty sea, and stopping, impossibly, on a light that answers it',
      signatureShort: 'the beam and the answering light',
      weather: 'salt wind, and a thin rain that never quite lands',
      landmark: 'lighthouse',
      wardrobe: 'an oilskin coat, a wool cap, and a rust-red scarf that never comes off indoors or out',
      accentItem: 'the rust-red scarf',
      grounderRole: 'the harbormaster',
      grounderLine: 'the living world, arriving with forms to sign and no patience for ghosts'
    },
    {
      id: 'ship',
      keys: ['ship', 'boat', 'ferry', 'captain', 'crew', 'voyage', 'sailing', 'liner', 'submarine'],
      place: 'the night deck of a ship three days from any port',
      shortPlace: 'the ship',
      placeWord: 'the Deck',
      interior: 'the chart room and the bridge',
      titleNoun: 'Wake',
      palette: { name: 'navy dark, brass and cold phosphor green', sky: ['#081120', '#1d3a52'], sea: '#0a1e30', ground: '#0d141d', accent: '#9fe8c1', paper: '#e6e8da' },
      light: 'instrument glow and a single hooded deck lamp',
      setPiece: 'the night the ship sails straight through the storm that should have sunk her',
      cheapCut: 'we never show the wave. We show the chart table sliding, the lamp swinging, and faces listening to the hull',
      signature: 'a long take down the empty deck while every loose object on the ship leans the same way at once',
      signatureShort: 'the deck leaning as one',
      weather: 'a swell you feel in your knees before you see it',
      landmark: 'ship',
      wardrobe: 'a salt-stiff peacoat, a brass whistle on a cord, and a rust-red scarf',
      accentItem: 'the rust-red scarf',
      grounderRole: 'the first officer',
      grounderLine: 'the living world, with a schedule, a log, and a weather report that disagrees'
    },
    {
      id: 'desert',
      keys: ['desert', 'dune', 'oasis', 'sandstorm', 'caravan', 'well'],
      place: 'a water station at the edge of a salt desert',
      shortPlace: 'the water station',
      placeWord: 'the Station',
      interior: 'the shade room behind the water tanks',
      titleNoun: 'Well',
      palette: { name: 'bone white, ochre and a hard cobalt dusk', sky: ['#131a33', '#5a4a63'], sea: '#3a2c22', ground: '#171310', accent: '#ffc46b', paper: '#efe6d0' },
      light: 'one hurricane lamp and the white glare remembered through shutters',
      setPiece: 'the sandstorm arriving like a second horizon, swallowing the road in one shot',
      cheapCut: 'we never build the storm. We close the shutters and let the sound and one rope of sand under the door do it',
      signature: 'a single figure crossing the white pan at dusk, footprints filling with wind behind them',
      signatureShort: 'the crossing at dusk',
      weather: 'heat standing on everything like a hand',
      landmark: 'dunes',
      wardrobe: 'a dust coat, a wrapped headcloth, and a rust-red scarf used as a belt',
      accentItem: 'the rust-red scarf',
      grounderRole: 'the station master',
      grounderLine: 'the living world, counting water drums and owing nobody an explanation'
    },
    {
      id: 'city',
      keys: ['city', 'street', 'apartment', 'office', 'hotel', 'subway', 'taxi', 'neighbourhood', 'neighborhood', 'block', 'rooftop'],
      place: 'one city block that never fully sleeps',
      shortPlace: 'the block',
      placeWord: 'the Block',
      interior: 'a small room with one window on the street',
      titleNoun: 'Window',
      palette: { name: 'asphalt blue, neon rose and sodium streetlight', sky: ['#0b0f1e', '#2c2a4a'], sea: '#141a2c', ground: '#0d1017', accent: '#ff7d9c', paper: '#e8e4da' },
      light: 'streetlight through blinds and whatever the window across the way is watching',
      setPiece: 'the night the whole block loses power at once and every window lights a candle',
      cheapCut: 'we never restage the blackout wide. We stay in one room and let the windows across the street tell it',
      signature: 'a slow push toward one lit window among two hundred dark ones',
      signatureShort: 'the one lit window',
      weather: 'rain that only shows under streetlights',
      landmark: 'skyline',
      wardrobe: 'a worn overcoat, a city cap, and a rust-red scarf',
      accentItem: 'the rust-red scarf',
      grounderRole: 'the building caretaker',
      grounderLine: 'the living world, with keys to everything and opinions about everyone'
    },
    {
      id: 'mountain',
      keys: ['mountain', 'alpine', 'cabin', 'snow', 'winter', 'peak', 'valley', 'ski', 'hut'],
      place: 'a weather cabin above the snowline',
      shortPlace: 'the cabin',
      placeWord: 'the Cabin',
      interior: 'the one heated room of the cabin',
      titleNoun: 'Snowline',
      palette: { name: 'blue shadow snow, pine black and stove orange', sky: ['#0a1322', '#33506e'], sea: '#16283c', ground: '#0e141c', accent: '#ff9a4d', paper: '#e9e7db' },
      light: 'a wood stove and a storm lantern, with blue dusk at every window',
      setPiece: 'the avalanche heard from inside, the whole mountain clearing its throat',
      cheapCut: 'we never show the slope letting go. We show the cups rattling, the stove door breathing, and then the silence after',
      signature: 'a lantern carried across a white field at blue hour, the only moving thing in the world',
      signatureShort: 'the lantern crossing',
      weather: 'snow that falls straight down, like it is deciding',
      landmark: 'peaks',
      wardrobe: 'a patched parka, leather mittens, and a rust-red scarf',
      accentItem: 'the rust-red scarf',
      grounderRole: 'the valley postman',
      grounderLine: 'the living world, arriving on skis with mail and mountain gossip'
    },
    {
      id: 'forest',
      keys: ['forest', 'woods', 'trees', 'jungle', 'grove', 'clearing', 'ranger'],
      place: 'a fire-watch tower in deep forest',
      shortPlace: 'the tower',
      placeWord: 'the Tower',
      interior: 'the glassed-in cab of the tower',
      titleNoun: 'Treeline',
      palette: { name: 'moss dark, fern green and a single amber bulb', sky: ['#0a1410', '#274435'], sea: '#12271c', ground: '#0c130e', accent: '#ffcf6e', paper: '#e7e8d6' },
      light: 'one amber bulb and the green dusk of the canopy',
      setPiece: 'the night the forest fire starts on three ridges at once',
      cheapCut: 'we never show the fire front. We show the tower cab filling with orange light that has no source you can point to',
      signature: 'a slow pan across a silent treeline where every bird leaves at the same second',
      signatureShort: 'the birds leaving as one',
      weather: 'a stillness so complete you can hear sap move',
      landmark: 'trees',
      wardrobe: 'a canvas jacket, a brimmed hat, and a rust-red scarf',
      accentItem: 'the rust-red scarf',
      grounderRole: 'the relief ranger',
      grounderLine: 'the living world, climbing a hundred stairs with supplies and scepticism'
    },
    {
      id: 'train',
      keys: ['train', 'railway', 'station', 'locomotive', 'conductor', 'compartment', 'platform'],
      place: 'a night train that runs a route nobody else wants',
      shortPlace: 'the night train',
      placeWord: 'the Night Train',
      interior: 'the last compartment and the corridor',
      titleNoun: 'Last Train',
      palette: { name: 'carriage green, brass and passing sodium', sky: ['#0b1016', '#2b3644'], sea: '#131c26', ground: '#0d1116', accent: '#ffd27a', paper: '#e8e5d4' },
      light: 'corridor lamps and the strobing light of towns passed at speed',
      setPiece: 'the train crossing the long bridge in a storm, seen from the last window',
      cheapCut: 'we never leave the train. The bridge happens outside the glass, in reflection, doubled with faces',
      signature: 'a locked-off shot down the corridor as every door opens down the line, one after another',
      signatureShort: 'the corridor of doors',
      weather: 'speed weather: rain that travels sideways',
      landmark: 'train',
      wardrobe: 'a uniform coat worn soft with years, a peaked cap, and a rust-red scarf under the collar',
      accentItem: 'the rust-red scarf',
      grounderRole: 'the ticket inspector',
      grounderLine: 'the living world, with a punch, a timetable, and no imagination he will admit to'
    },
    {
      id: 'space',
      keys: ['space', 'orbit', 'station', 'astronaut', 'planet', 'lunar', 'moon base', 'spaceship', 'signal from'],
      place: 'a two-person station keeping a long orbit',
      shortPlace: 'the station',
      placeWord: 'the Station',
      interior: 'the cupola and the comms rack',
      titleNoun: 'Orbit',
      palette: { name: 'panel grey, warning amber and the blue of a whole planet', sky: ['#05070f', '#16283f'], sea: '#0a1626', ground: '#0a0d12', accent: '#ffb454', paper: '#e4e8ea' },
      light: 'panel glow and one unblinking planet below',
      setPiece: 'the EVA sequence, a full spacewalk to the dead antenna',
      cheapCut: 'we never go outside. The spacewalk happens as sound, breath and a camera feed that keeps almost working',
      signature: 'a locked shot of the cupola while the entire planet turns beneath one small listening figure',
      signatureShort: 'the planet turning below',
      weather: 'weatherless; only the hiss of the air system, changing its mind',
      landmark: 'planet',
      wardrobe: 'a flight suit gone soft at the elbows, mission patches, and a rust-red scarf that should not be aboard but is',
      accentItem: 'the rust-red scarf',
      grounderRole: 'the voice of mission control',
      grounderLine: 'the living world, two seconds of delay away and reading from a checklist'
    },
    {
      id: 'village',
      keys: ['village', 'farm', 'field', 'village square', 'mill', 'harvest', 'grandmother', 'bakery', 'post office'],
      place: 'a village that measures time by bread and bells',
      shortPlace: 'the village',
      placeWord: 'the Village',
      interior: 'a kitchen that is also an office, a court and a confessional',
      titleNoun: 'Bell',
      palette: { name: 'flour white, field green and stove black', sky: ['#0d1524', '#3d4a3a'], sea: '#1c2a1a', ground: '#10130d', accent: '#ffc46b', paper: '#efe9d6' },
      light: 'a stove, a window, and the honest glare of morning',
      setPiece: 'the harvest festival, the whole village in the square at once',
      cheapCut: 'we never fill the square. We hear the festival through a kitchen window and count it in trays carried past',
      signature: 'a dawn shot of the square, empty except for one figure setting out chairs for people who may not come',
      signatureShort: 'the chairs at dawn',
      weather: 'weather that is also gossip: everyone knows it before it arrives',
      landmark: 'house',
      wardrobe: 'a work shirt, a heavy apron, and a rust-red scarf for market days that never comes off on any day',
      accentItem: 'the rust-red scarf',
      grounderRole: 'the postmaster',
      grounderLine: 'the living world, who has read everyone\u2019s postcards since 1987'
    },
    {
      id: 'generic',
      keys: [],
      place: 'the rooms where it happened, and the one road out of them',
      shortPlace: 'the place itself',
      placeWord: 'the Place',
      interior: 'the main room, where everything important is kept',
      titleNoun: 'Hour',
      palette: { name: 'warm dark, bone white and one amber source', sky: ['#0c0f16', '#2c3038'], sea: '#18202a', ground: '#0e1114', accent: '#ffb454', paper: '#e9e4d4' },
      light: 'one practical lamp that the whole film is allowed to trust',
      setPiece: 'the night everything the story has been holding back arrives at once',
      cheapCut: 'we never show it arriving. We stay in the main room and let it change the light under the door',
      signature: 'a locked-off wide of the main room, held ten seconds longer than comfort allows',
      signatureShort: 'the long held wide',
      weather: 'weather that behaves like a mood and is never discussed',
      landmark: 'house',
      wardrobe: 'clothes worn like a uniform of one, and a rust-red scarf',
      accentItem: 'the rust-red scarf',
      grounderRole: 'the neighbour',
      grounderLine: 'the living world, knocking with a reason that is almost true'
    }
  ];

  var MOTIFS = [
    { keys: ['radio', 'wireless', 'transmission', 'broadcast', 'frequency'], name: 'radio', poetic: 'Static', kind: 'voice', insert: 'a bakelite radio, its dial glowing, the needle trembling between stations' },
    { keys: ['telephone', 'phone call', 'a call', 'calls him', 'calls her', 'ringing phone'], name: 'telephone', poetic: 'the Unanswered Ring', kind: 'voice', insert: 'a black telephone that rings in a pattern no exchange ever used' },
    { keys: ['letter', 'letters', 'envelope', 'postcard'], name: 'letter', poetic: 'the Last Letter', kind: 'object', insert: 'an envelope with no stamp, the handwriting unmistakably a dead hand\u2019s' },
    { keys: ['photograph', 'photo', 'picture', 'portrait'], name: 'photograph', poetic: 'the Extra Face', kind: 'object', insert: 'a photograph in which one face too many is looking at the camera' },
    { keys: ['ticket'], name: 'ticket', poetic: 'the Unused Ticket', kind: 'object', insert: 'a punched ticket for a journey the timetable says never ran' },
    { keys: ['key'], name: 'key', poetic: 'the Last Key', kind: 'object', insert: 'a heavy key, warm, that no door in the building admits to fitting' },
    { keys: ['song', 'melody', 'music', 'lullaby', 'tune'], name: 'song', poetic: 'the Half-Remembered Song', kind: 'voice', insert: 'a tune hummed from behind a wall, always stopping at the same bar' },
    { keys: ['film reel', 'silent film', 'reel', 'footage', 'recording', 'tape'], name: 'recording', poetic: 'the Last Reel', kind: 'object', insert: 'a reel of tape that plays eleven seconds nobody recorded' },
    { keys: ['mirror'], name: 'mirror', poetic: 'the Slow Mirror', kind: 'object', insert: 'a mirror in which the room is always one second behind' },
    { keys: ['diary', 'journal', 'logbook', 'notebook'], name: 'logbook', poetic: 'the Other Handwriting', kind: 'object', insert: 'a logbook whose newest entry is in handwriting that is almost, but not quite, his own' },
    { keys: ['map'], name: 'map', poetic: 'the Extra Coastline', kind: 'object', insert: 'a map with one coastline drawn in that no survey admits to' },
    { keys: ['clock', 'watch', 'bell'], name: 'clock', poetic: 'the Stopped Hour', kind: 'object', insert: 'a clock that keeps stopping at the minute everything changed' },
    { keys: ['voice', 'voices', 'message', 'messages', 'signal'], name: 'voice', poetic: 'the Voice', kind: 'voice', insert: 'a voice that arrives the way weather arrives, from no visible source' }
  ];

  var PEOPLE = ['keeper', 'archivist', 'conductor', 'captain', 'vendor', 'widow', 'widower', 'teacher', 'doctor', 'monk', 'ranger', 'postman', 'baker', 'locksmith', 'projectionist', 'curator', 'librarian', 'gardener', 'watchman', 'operator', 'clerk', 'priest', 'singer', 'cook', 'driver', 'engineer', 'nurse', 'ferryman', 'beekeeper', 'cartographer'];

  var MALE_NAMES = ['Elias', 'Tomas', 'Amos', 'Silas', 'Jonas', 'Emil', 'Hugo', 'Caspar', 'Ruben', 'Anton'];
  var FEMALE_NAMES = ['Maren', 'Ines', 'Ruth', 'Alma', 'Clara', 'Nadia', 'Petra', 'Signe', 'Mira', 'Odile'];

  var TONE_WORDS = ['haunted', 'lonely', 'silent', 'secret', 'lost', 'forgotten', 'last', 'first', 'forbidden', 'missing', 'stolen', 'hidden', 'final', 'endless', 'impossible'];

  /* ---------- idea parsing ---------- */

  var LEAD_VERBS = 'starts?|begins?|keeps?|finds?|discovers?|receives?|gets?|hears?|sees|is|was|are|who|must|wants?|decides?|refuses?|learns?|remembers?|wakes?|returns?|arrives?|opens?|answers?|inherits?|takes|meets|waits|restoring|repairing|fixing|guarding|tending|running';

  function parseIdea(rawIdea) {
    var idea = (rawIdea || '').trim().replace(/\s+/g, ' ');
    var lower = ' ' + idea.toLowerCase() + ' ';
    var rng = mulberry32(hashSeed(idea.toLowerCase()));

    /* setting: score lexicon hits, earliest strong setting wins ties */
    var setting = SETTINGS[SETTINGS.length - 1], bestScore = 0;
    SETTINGS.forEach(function (s) {
      var score = 0;
      s.keys.forEach(function (k) { if (lower.indexOf(k) !== -1) score += k.length; });
      if (score > bestScore) { bestScore = score; setting = s; }
    });

    /* protagonist phrase: leading "A/An/The X" up to the main verb */
    var protagonist = null, hook = idea;
    var m = idea.match(new RegExp('^\\s*(a|an|the|two|three)\\s+(.+?)(?=\\s+(?:' + LEAD_VERBS + ')\\b|[,.;]|$)', 'i'));
    if (m && m[2] && m[2].length >= 3 && m[2].split(' ').length <= 6) {
      protagonist = m[2].trim();
      hook = idea.slice(m[0].length).trim();
    }
    if (!protagonist) {
      for (var i = 0; i < PEOPLE.length; i++) {
        var idx = lower.indexOf(' ' + PEOPLE[i] + ' ');
        if (idx !== -1) { protagonist = PEOPLE[i]; break; }
      }
      if (!protagonist) protagonist = 'keeper of the place';
    }
    var roleWords = protagonist.split(' ');
    var role = roleWords[roleWords.length - 1].replace(/[^a-z-]/gi, '');
    if (PEOPLE.indexOf(role.toLowerCase()) === -1) {
      for (var j = roleWords.length - 1; j >= 0; j--) {
        if (PEOPLE.indexOf(roleWords[j].toLowerCase()) !== -1) { role = roleWords[j]; break; }
      }
    }

    /* hook: strip leading verb scaffolding ("starts receiving", "begins to hear") */
    hook = hook.replace(new RegExp('^(?:' + LEAD_VERBS + ')\\s+(?:to\\s+)?', 'i'), '')
               .replace(/^(receiving|getting|hearing|finding|discovering)\s+/i, '')
               .replace(/^forced\s+to\s+/i, '')
               .replace(/^[,;]\s*/, '')
               .replace(/\.$/, '')
               .trim();
    if (!hook || hook.length < 4) hook = 'something that should be impossible and is not';

    /* motif: search hook first, then the whole idea */
    var motif = null;
    MOTIFS.forEach(function (mo) {
      if (motif) return;
      for (var k = 0; k < mo.keys.length; k++) {
        if ((' ' + hook.toLowerCase() + ' ').indexOf(mo.keys[k]) !== -1 || lower.indexOf(mo.keys[k]) !== -1) { motif = mo; break; }
      }
    });
    if (!motif) motif = MOTIFS[MOTIFS.length - 1];

    /* genre */
    var genre = 'drama';
    if (/sank|sunk|ghost|dead|drowned|spirit|haunted|grave|widow/.test(lower)) genre = 'ghost story';
    else if (/space|orbit|robot|future|alien|planet|signal from deep/.test(lower)) genre = 'science fiction';
    else if (/murder|stolen|chase|countdown|heist|kidnap|bomb/.test(lower)) genre = 'thriller';
    else if (/who took|who is sending|mystery|disappeared|vanished|secret identity/.test(lower)) genre = 'mystery';
    else if (motif.kind === 'voice') genre = 'mystery';

    var tones = TONE_WORDS.filter(function (t) { return lower.indexOf(t) !== -1; });

    /* names and pronouns, fixed by seed so the demo rehearses identically;
       an explicit her/she or his/he in the line overrides the coin flip */
    var female = rng() < 0.5;
    if (/\b(her|hers|she)\b/.test(lower) && !/\b(his|him|he)\b/.test(lower)) female = true;
    if (/\b(his|him)\b/.test(lower) && !/\b(her|she)\b/.test(lower)) female = false;
    var name = pick(rng, female ? FEMALE_NAMES : MALE_NAMES);
    var name2 = pick(rng, female ? MALE_NAMES : FEMALE_NAMES);
    if (name2 === name) name2 = female ? 'Tomas' : 'Maren';
    var pronoun = female ? 'she' : 'he';
    var poss = female ? 'her' : 'his';

    return {
      raw: idea, setting: setting, protagonist: protagonist, role: role,
      hook: hook, motif: motif, genre: genre, tones: tones,
      name: name, name2: name2, pronoun: pronoun, poss: poss, rng: rng
    };
  }

  /* ---------- agent positions ---------- */

  function buildAgents(p) {
    var rng = p.rng, s = p.setting, mo = p.motif;
    var P = p.pronoun, PS = p.poss;

    var wants = [
      'a quiet, finished life: the same rounds, the same duties, nothing owed to anyone and nothing asked',
      'to be left alone with one honest piece of work, done properly, the way it was done before ' + P + ' arrived',
      'proof, just once, that the years of routine meant something to somebody'
    ];
    var flawsVoice = [
      P + ' answers. Whatever speaks through the ' + mo.name + ', ' + P + ' answers it, and every answer costs ' + PS + ' a piece of the quiet',
      P + ' cannot leave a message unanswered; it is the politeness of the lonely, and it will be ' + PS + ' undoing',
      P + ' listens one night too many. Listening is ' + PS + ' job. Answering is ' + PS + ' flaw'
    ];
    var flawsObject = [
      P + ' keeps the ' + mo.name + ' when every rule of the place says hand it in, and keeping it becomes the whole story',
      P + ' uses the ' + mo.name + ' once, privately, and then has to live inside what it showed ' + (P === 'she' ? 'her' : 'him'),
      P + ' cannot throw the ' + mo.name + ' away. Sentiment dressed as duty; it will cost ' + (P === 'she' ? 'her' : 'him')
    ];
    var rulesVoice = 'the ' + mo.name + ' never speaks in full sentences and never explains itself. Fragments only. Static, half-words, a name at most. The audience leans in because we refuse to lean toward them';
    var rulesObject = 'the ' + mo.name + ' is never used, opened or read aloud until the final movement of the film. It can be carried, hidden, weighed in the hand, but its power stays locked, so the story stays honest';

    var cliches = {
      'ghost story': 'the dead returning to politely explain the plot to the living, with all the mystery drained out of them',
      'mystery': 'the answer arriving in one tidy speech at the end, gift-wrapped, because the film stopped trusting its audience',
      'science fiction': 'the impossible thing turning out to be a metaphor for grief, announced out loud, in case anyone missed it',
      'thriller': 'a countdown that exists only so it can be beaten in the last reel',
      'drama': 'a closed person cured by one honest conversation and a sunrise'
    };

    var vetoes = {
      'ghost story': {
        element: 'the final transmission, the one where the voice finally explains how it all ended. It is currently the last beat of the treatment, and it has to go',
        revision: 'the last transmission explains nothing. It is ' + p.name + '\u2019s own name, given slowly, the way you read a name off a list of the missing. Then static. Then the ordinary morning'
      },
      'mystery': {
        element: 'the final reveal, where the ' + mo.name + ' names its sender outright and the puzzle clicks shut. Click is the sound of an audience leaving',
        revision: 'the last message is an absence, not an answer: one expected fragment that never comes. ' + cap(P) + ' waits for it, understands what the silence means, and puts the kettle on'
      },
      'science fiction': {
        element: 'the closing explanation, where the phenomenon is translated into plain language and filed. Wonder does not survive filing',
        revision: 'the phenomenon is never translated. The final fragment repeats the first one, word for word, and this time ' + p.name + ' answers it differently, and that difference is the whole ending'
      },
      'thriller': {
        element: 'the last-minute reprieve, the cavalry beat where the pressure simply lets go. Pressure that lets go on cue is lying',
        revision: 'nothing is reprieved. The ending is a consequence arriving on time: ' + p.name + ' pays the exact price the first act quoted, and pays it without flinching'
      },
      'drama': {
        element: 'the sunrise reconciliation, where everyone says the true thing and the film pats itself on the back. I will not sign a film that lies about people',
        revision: 'there is no reconciliation scene. There is a small, practical kindness, done without speeches, and the camera is too respectful to push in on it'
      }
    };

    var themesByGenre = {
      'ghost story': ['What the living owe the dead, and what the dead should stop asking for', 'Listening as a form of courage', 'Routine as a seawall against grief'],
      'mystery': ['The difference between an answer and the truth', 'What a place remembers when people will not', 'Curiosity as both duty and disease'],
      'science fiction': ['How far a voice can carry, and what it costs to answer', 'Procedure as a prayer against the dark', 'The loneliness of being believed too late'],
      'thriller': ['The price of the first small compromise', 'Time as the only honest villain', 'What a professional does when the rules run out'],
      'drama': ['The work nobody sees that keeps the world lit', 'Wanting to be left alone, and being wrong about it', 'Small duties, carried exactly, as a way of loving']
    };

    return {
      writer: {
        want: pick(rng, wants),
        flaw: mo.kind === 'voice' ? pick(rng, flawsVoice) : pick(rng, flawsObject),
        rule: mo.kind === 'voice' ? rulesVoice : rulesObject,
        pitch: 'The heart of it is not the ' + mo.name + '. The heart is ' + article(p.role) + ' ' + p.role + ' who has arranged a whole life around not being needed, and then the ' + mo.name + ' needs ' + (P === 'she' ? 'her' : 'him') + '.'
      },
      director: {
        opening: 'we open on ' + s.place + ' at dusk, and the place is doing its ordinary work, beautifully, like it has never heard of our story',
        setPiece: s.setPiece,
        closing: 'dawn. The place ordinary again, the light doing its job, and one small thing different that the audience has to find for themselves'
      },
      cinematographer: {
        paletteLine: 'the palette is ' + s.palette.name + '. It does not change. The film\u2019s weather changes, its light changes, but the palette is a promise',
        lightLine: 'the light is ' + s.light + '. Every frame is motivated by it; nothing glows without a reason',
        method: 'long lenses through glass, weather and doorways, so the world is always one pane away from ' + p.name + '. When the pane finally disappears, the audience will feel it in their shoulders'
      },
      producer: {
        locations: [s.interior, s.place],
        cheapCut: s.cheapCut,
        lockLine: 'two locations, both of them ' + s.shortPlace + '. Nine shots on the list, four frames on the board, no night exteriors beyond what the lamp gives us for free'
      },
      critic: {
        cliche: cliches[p.genre] || cliches.drama,
        veto: vetoes[p.genre] || vetoes.drama,
        openingShot: 'and I am warning the room now: there is one element in this treatment I will veto at the end of this meeting if it is still standing. You will know it when I say it'
      },
      themes: themesByGenre[p.genre] || themesByGenre.drama
    };
  }

  /* ---------- the debate ---------- */

  var AGENTS = {
    writer: { name: 'Writer', role: 'Story and characters' },
    director: { name: 'Director', role: 'Vision and staging' },
    cinematographer: { name: 'Cinematographer', role: 'Light and image' },
    producer: { name: 'Producer', role: 'Scope and schedule' },
    critic: { name: 'Critic', role: 'Taste and veto' }
  };

  function runDebate(p, a) {
    var s = p.setting, mo = p.motif;
    var turns = [], decisions = [];
    function turn(round, agent, kind, text) {
      turns.push({ n: turns.length + 1, round: round, agent: agent, agentName: AGENTS[agent].name, kind: kind, text: text });
    }
    function decide(clash, winner, loser, why) {
      decisions.push({ clash: clash, winner: AGENTS[winner].name, loser: AGENTS[loser].name, why: why, afterTurn: turns.length });
    }

    /* Round 1 — positions */
    turn('Positions', 'writer', 'position',
      'Here is the film I can write. ' + a.writer.pitch + ' What ' + p.name + ' wants is ' + a.writer.want + '. And the flaw, the engine of the whole thing: ' + a.writer.flaw + '. The premise, plainly: ' + p.hook + '. I intend to take it seriously and never wink.');
    turn('Positions', 'director', 'position',
      'Then I will open it the only way it should open: ' + a.director.opening + '. One idea, one place, one person, and the place is already acting. If the first shot does not make a festival audience sit up, the rest of this meeting is decoration.');
    turn('Positions', 'cinematographer', 'position',
      'My position is about trust. ' + cap(a.cinematographer.paletteLine) + '. And ' + a.cinematographer.lightLine + '. ' + cap(a.cinematographer.method) + '.');
    turn('Positions', 'producer', 'position',
      'My position is arithmetic. This is ' + article(p.genre) + ' ' + p.genre + ' built around one performer and ' + s.shortPlace + ', and that is exactly why it can be great: it is shootable. ' + cap(a.producer.lockLine) + '. Anything the rest of you dream beyond that, bring a smaller version or bring money.');
    turn('Positions', 'critic', 'position',
      'My position is suspicion. This genre dies of one disease: ' + a.critic.cliche + '. I have seen this exact film fail four times. ' + cap(a.critic.openingShot) + '. Proceed. I am listening, which for me is generosity.');

    /* Round 2 — clashes */
    turn('Clashes', 'critic', 'clash',
      'Writer. Your premise, "' + p.hook + '", is one lazy draft away from ' + a.critic.cliche + '. What, mechanically, stops your ' + mo.name + ' from becoming an exposition machine with a spooky voice?');
    turn('Clashes', 'writer', 'response',
      'A rule, and I will put it in the treatment where everyone can hold me to it: ' + a.writer.rule + '. The mystery is never the mechanism. The mystery is what it does to ' + p.name + ' to keep listening.');
    decide('Story vs clich\u00e9', 'critic', 'writer',
      'The Critic\u2019s attack landed, and the Writer answered with a binding rule instead of a promise: ' + a.writer.rule + '. The rule is adopted into the treatment.');

    turn('Clashes', 'director', 'clash',
      'Then give me my set piece. I want ' + a.director.setPiece + '. One sequence the trailer can steal. A film this quiet needs one moment of weather, literally or otherwise, or the audience will call it a radio play with pictures.');
    turn('Clashes', 'producer', 'response',
      'Denied, and here is the cheaper truth: ' + a.producer.cheapCut + '. What you keep, Director, is one signature shot, and it is a good one: ' + s.signature + '. That shot costs a lens, a lamp and patience. The storm costs the film.');
    decide('Scope vs spectacle', 'producer', 'director',
      'The Producer cut the set piece to sound and glass, but protected the signature shot: ' + s.signatureShort + '. The shot list follows the cut version.');

    turn('Clashes', 'cinematographer', 'response',
      'For the record, the cut makes my job better, not worse. ' + cap(a.cinematographer.lightLine) + ', so the signature shot is achievable on the night, in camera, without a single effect: ' + s.signature + '. And when the ' + mo.name + ' speaks, I will drop the room a half-stop darker. The audience will not know why they are holding their breath.');

    /* Resolution */
    turn('Resolution', 'critic', 'veto',
      'Now the veto, and I use my one. I veto ' + a.critic.veto.element + '.');
    turn('Resolution', 'writer', 'revise',
      'Noted, and, I hate saying this in front of witnesses, but the Critic is right. Revised ending, on the record: ' + a.critic.veto.revision + '. It is a better ending. It is also a harder one to write, which is usually the same sentence.');
    decide('The veto', 'critic', 'writer',
      'The Critic spent the veto on the ending. The Writer revised it on the spot: ' + a.critic.veto.revision + '. The treatment and the final shot carry the revised ending.');

    turn('Resolution', 'producer', 'lock',
      'Scope is locked. ' + cap(a.producer.lockLine) + '. The argument you just had is the film: small, exact, and nobody in it is allowed to explain themselves. We shoot that.');
    turn('Resolution', 'director', 'final',
      'Final visual say, then, and I take it gladly: the film ends as it began, ' + a.director.closing + '. Bookends. The place was there before the story and it outlasts it. If we have done our jobs, that last wide shot will feel like an answer, even though, per the Critic, it explains nothing.');
    decide('Final image', 'director', 'critic',
      'The Director claimed the closing image: a bookend of the opening, changed by exactly one small detail. The Critic let it stand because it explains nothing.');

    return { turns: turns, decisions: decisions };
  }

  /* ---------- treatment ---------- */

  function compileTreatment(p, a) {
    var s = p.setting, mo = p.motif, rng = p.rng;
    var him = p.pronoun === 'she' ? 'her' : 'him';
    var titlePool = [
      'The ' + cap(p.role) + '\u2019s ' + mo.poetic.replace(/^the /i, ''),
      mo.poetic.replace(/^the /i, '') + ' at ' + s.placeWord,
      'What the ' + cap(mo.name) + ' Said',
      'The ' + s.titleNoun + ' and ' + mo.poetic
    ];
    var title = pick(rng, titlePool);

    var logline = p.name + ', ' + article(p.protagonist) + ' ' + p.protagonist + ' at ' + s.shortPlace +
      ', has built a whole life out of routine and silence. Then it starts: ' + p.hook +
      '. Answering it will cost ' + him + ' the only life ' + p.pronoun + ' has.';

    var synopsis = [
      p.name + ' keeps ' + s.shortPlace + '. The work is exact and the days are identical by design: ' +
        'the rounds, the records, ' + s.weather + ', and a quiet that has been earned the hard way. What ' + p.name +
        ' wants is ' + a.writer.want + '. The only other regular presence is ' + p.name2 + ', ' + s.grounderRole + ': ' + s.grounderLine + '.',
      'Then: ' + p.hook + '. It obeys one law, the rule the film never breaks: ' + a.writer.rule +
        '. At first ' + p.name + ' only listens, and listening is the job. But the flaw is already in the room: ' + a.writer.flaw +
        '. Night by night the fragments arrange themselves into something that knows ' + p.poss + ' name, ' + p.poss +
        ' routine, and the one entry missing from the official record. The signature moment of the film is ' + s.signature + '.',
      'The cost arrives through the living, not the dead: ' + p.name2 + ' brings a decision from the world outside, ' +
        'and ' + p.name + ' must choose between the quiet and the voice in front of a witness. The ending, as revised in the studio and never explained: ' +
        a.critic.veto.revision + '. Final image: ' + a.director.closing + '.'
    ];

    var counterpart = mo.kind === 'voice'
      ? { name: 'The Voice', role: 'Heard through the ' + mo.name + ', never seen', want: 'to be answered, which is not the same as to be rescued', flaw: 'it only ever tells the truth in pieces, and the pieces are chosen to be continued' }
      : { name: 'The Sender', role: 'Whoever the ' + mo.name + ' came from; present only as handwriting, wear and intention', want: 'to be found, on exactly their own terms', flaw: 'everything they left behind is true, and none of it is the whole truth' };

    return {
      title: title,
      logline: logline,
      synopsis: synopsis,
      themes: a.themes.slice(),
      characters: [
        { name: p.name, role: cap(p.protagonist), want: cap(a.writer.want) + '.', flaw: cap(a.writer.flaw) + '.' },
        counterpart,
        { name: p.name2, role: cap(s.grounderRole), want: 'For the record to stay clean and the living to stay in charge of the living', flaw: s.grounderLine }
      ]
    };
  }

  /* ---------- shot list ---------- */

  function compileShotList(p, a) {
    var s = p.setting, mo = p.motif;
    var raw = [
      { beat: 'Opening image', size: 'Extreme Wide', lens: '18mm feel, deep focus', move: 'Locked-off',
        scene: 'exterior',
        desc: 'Dusk over ' + s.place + '. The place is doing its ordinary work and the light is ' + s.light + '. ' + p.name + ' crosses the frame small, ' + s.accentItem + ' the only colour that moves.' },
      { beat: 'The routine', size: 'Wide', lens: '35mm, the honest lens', move: 'Slow push-in',
        scene: 'interior',
        desc: cap(s.interior) + ', morning order: the records kept, the equipment checked, the ' + mo.name + ' silent where it sits. ' + p.name + ' moves through the room like a liturgy performed for an audience of none.' },
      { beat: 'The anomaly', size: 'Insert', lens: 'Macro insert, shallow focus', move: 'Locked-off, held too long',
        scene: 'motif',
        desc: 'Insert: ' + mo.insert + '. Hold on it a full ten seconds. Then ' + p.name + '\u2019s hand enters frame, and does not touch it. Not yet.' },
      { beat: 'The first answer', size: 'Medium', lens: '50mm, eye level', move: 'Static, then a barely-there drift',
        scene: 'interior',
        desc: p.name + ' at the ' + mo.name + ', and the flaw in action: ' + p.pronoun + ' answers. As ' + p.pronoun + ' speaks, the room drops a half-stop darker, per the Cinematographer\u2019s rule, and nobody on screen notices.' },
      { beat: 'Fragments', size: 'Medium Close-Up', lens: '85mm through glass', move: 'Handheld, barely',
        scene: 'motif',
        desc: 'The ' + mo.name + ' again, fragments only, the Writer\u2019s rule made visible. Between fragments, ' + s.weather + '. ' + p.name + ' writes nothing in the record. The omission is the shot.' },
      { beat: 'The signature shot', size: 'Wide', lens: '40mm, one take', move: 'One slow pan, single take',
        scene: 'signature',
        desc: cap(s.signature) + '. One take, no coverage. This is the shot the Producer saved from the storm sequence, and the one the film will be remembered by, or not at all.' },
      { beat: 'The cost', size: 'Medium Two-Shot', lens: '35mm from the doorway', move: 'Static two-shot',
        scene: 'interior',
        desc: p.name2 + ', ' + s.grounderRole + ', arrives with the living world in ' + (p.pronoun === 'she' ? 'his' : 'her') + ' hands: ' + s.grounderLine + '. The ' + mo.name + ' sits on the table between them, saying nothing, which by now is the loudest thing in the film.' },
      { beat: 'The revised ending', size: 'Close-Up', lens: '85mm, shallow', move: 'Slow push to close',
        scene: 'motif',
        desc: 'The final movement, staged exactly as revised under the Critic\u2019s veto: ' + a.critic.veto.revision + '.' },
      { beat: 'Closing image', size: 'Extreme Wide', lens: '18mm feel, deep focus', move: 'Locked-off bookend of shot 1',
        scene: 'exterior-dawn',
        desc: 'Bookend of the opening: ' + a.director.closing + '. The audience is trusted to find the one small difference themselves.' }
    ];
    return raw.map(function (sh, i) {
      return { n: i + 1, beat: sh.beat, size: sh.size, lens: sh.lens, movement: sh.move, scene: sh.scene, description: sh.desc };
    });
  }

  /* ---------- storyboard frames: previz SVG ---------- */

  function figureSVG(x, gy, h, accent, opts) {
    opts = opts || {};
    var headR = h * 0.115, headCy = gy - h + headR;
    var shW = h * 0.20, hipW = h * 0.15, shY = gy - h * 0.80, hemY = opts.seated ? gy - h * 0.28 : gy;
    var body = 'M ' + (x - shW) + ' ' + hemY +
      ' L ' + (x - shW * 0.72) + ' ' + shY +
      ' Q ' + x + ' ' + (shY - h * 0.05) + ' ' + (x + shW * 0.72) + ' ' + shY +
      ' L ' + (x + hipW + (opts.seated ? h * 0.16 : 0)) + ' ' + hemY + ' Z';
    var scarf = 'M ' + (x - shW * 0.62) + ' ' + (shY + h * 0.03) + ' L ' + (x + shW * 0.62) + ' ' + (shY + h * 0.03) +
      ' L ' + (x + shW * 0.30) + ' ' + (shY + h * 0.15) + ' L ' + (x - shW * 0.30) + ' ' + (shY + h * 0.15) + ' Z';
    return '<g fill="#04060a"><circle cx="' + x + '" cy="' + headCy + '" r="' + headR + '"/><path d="' + body + '"/></g>' +
      '<path d="' + scarf + '" fill="' + accent + '" opacity="0.92"/>';
  }

  function landmarkSVG(kind, pal, big) {
    var f = 'fill="#04060a"';
    switch (kind) {
      case 'lighthouse':
        return '<g ' + f + '><path d="M292 268 L306 150 L330 150 L344 268 Z"/><rect x="300" y="128" width="36" height="24"/><path d="M300 128 L318 112 L336 128 Z"/><path d="M262 268 L318 236 L380 268 Z"/></g>' +
          '<circle cx="318" cy="140" r="7" fill="' + pal.accent + '"/>';
      case 'ship':
        return '<g ' + f + '><path d="M120 224 L360 224 L338 248 L146 248 Z"/><rect x="180" y="168" width="6" height="58"/><rect x="262" y="156" width="6" height="70"/><path d="M186 168 L262 224 L186 224 Z" opacity="0.85"/><path d="M268 156 L330 224 L268 224 Z" opacity="0.85"/></g>' +
          '<circle cx="265" cy="150" r="4" fill="' + pal.accent + '"/>';
      case 'dunes':
        return '<g ' + f + '><path d="M0 268 L0 226 Q 140 178 300 224 T 480 214 L480 268 Z"/><path d="M0 268 L0 246 Q 190 214 480 240 L480 268 Z" opacity="0.8"/></g>' +
          '<circle cx="392" cy="66" r="24" fill="' + pal.accent + '" opacity="0.85"/>';
      case 'skyline':
        var bars = '', x = 8, seed = 7;
        while (x < 470) { var w = 22 + (seed * 13) % 30, h = 60 + (seed * 29) % 110; bars += '<rect x="' + x + '" y="' + (268 - h) + '" width="' + w + '" height="' + h + '"/>'; x += w + 6; seed = (seed * 31 + 17) % 97; }
        return '<g ' + f + '>' + bars + '</g><circle cx="70" cy="52" r="4" fill="' + pal.accent + '"/><circle cx="238" cy="96" r="3" fill="' + pal.accent + '"/><circle cx="402" cy="70" r="4" fill="' + pal.accent + '"/>';
      case 'peaks':
        return '<g ' + f + '><path d="M0 268 L110 120 L190 268 Z"/><path d="M130 268 L268 84 L400 268 Z"/><path d="M320 268 L420 150 L480 268 Z"/></g>' +
          '<path d="M268 84 L296 122 L278 116 L262 128 L240 118 Z" fill="' + pal.paper + '" opacity="0.75"/>' +
          '<circle cx="70" cy="56" r="13" fill="' + pal.accent + '" opacity="0.8"/>';
      case 'trees':
        var tr = '', tx = 6, ts = 5;
        while (tx < 474) { var th = 66 + (ts * 23) % 84; tr += '<path d="M' + tx + ' 268 L' + (tx + 15) + ' ' + (268 - th) + ' L' + (tx + 30) + ' 268 Z"/>'; tx += 30; ts = (ts * 41 + 13) % 89; }
        return '<g ' + f + '>' + tr + '</g>';
      case 'train':
        return '<g ' + f + '><rect x="36" y="168" width="408" height="62" rx="10"/><rect x="36" y="230" width="408" height="12"/></g>' +
          '<g fill="' + pal.accent + '" opacity="0.9"><rect x="58" y="184" width="26" height="20"/><rect x="98" y="184" width="26" height="20"/><rect x="138" y="184" width="26" height="20"/><rect x="300" y="184" width="26" height="20"/><rect x="340" y="184" width="26" height="20"/><rect x="380" y="184" width="26" height="20"/></g>';
      case 'planet':
        return '<path d="M-60 320 A 330 200 0 0 1 540 320 Z" fill="#0a1c33"/><path d="M-60 320 A 330 200 0 0 1 540 320" fill="none" stroke="' + pal.accent + '" stroke-width="3" opacity="0.7"/>' +
          '<g ' + f + '><rect x="356" y="120" width="58" height="36"/><rect x="330" y="128" width="26" height="18"/><rect x="414" y="128" width="26" height="18"/></g>';
      default: /* house */
        return '<g ' + f + '><path d="M150 268 L150 176 L240 118 L330 176 L330 268 Z"/><path d="M138 180 L240 106 L342 180 L330 180 L240 122 L150 180 Z"/><rect x="286" y="128" width="14" height="34"/></g>' +
          '<rect x="216" y="200" width="24" height="30" fill="' + pal.accent + '" opacity="0.9"/>';
    }
  }

  function skyStars(pal) {
    var pts = [[40, 30], [90, 62], [150, 24], [210, 50], [268, 28], [330, 58], [392, 26], [440, 48], [120, 88], [360, 92]];
    return pts.map(function (pt) { return '<circle cx="' + pt[0] + '" cy="' + pt[1] + '" r="1.4" fill="' + pal.paper + '" opacity="0.65"/>'; }).join('');
  }

  function composeSVG(spec) {
    var pal = spec.palette, W = 480, H = 270;
    var dawn = spec.kind === 'exterior-dawn';
    var skyTop = dawn ? '#2c2a44' : pal.sky[0], skyBot = dawn ? '#7a5a52' : pal.sky[1];
    var out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Previz frame">';
    out += '<defs><linearGradient id="sky' + spec.uid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + skyTop + '"/><stop offset="1" stop-color="' + skyBot + '"/></linearGradient>' +
      '<radialGradient id="glow' + spec.uid + '"><stop offset="0" stop-color="' + pal.accent + '" stop-opacity="0.85"/><stop offset="1" stop-color="' + pal.accent + '" stop-opacity="0"/></radialGradient></defs>';

    if (spec.kind === 'interior') {
      out += '<rect width="480" height="270" fill="#060709"/>';
      out += '<rect x="168" y="34" width="196" height="128" fill="url(#sky' + spec.uid + ')"/>';
      out += '<g transform="translate(196,58) scale(0.42)">' + landmarkSVG(spec.landmark, pal) + '</g>';
      out += '<rect x="168" y="34" width="196" height="128" fill="none" stroke="#000" stroke-width="6"/>';
      out += '<rect x="60" y="196" width="360" height="12" fill="#04060a"/><rect x="76" y="208" width="10" height="42" fill="#04060a"/><rect x="394" y="208" width="10" height="42" fill="#04060a"/>';
      out += '<circle cx="98" cy="168" r="34" fill="url(#glow' + spec.uid + ')"/><circle cx="98" cy="172" r="6" fill="' + pal.accent + '"/>';
      out += propSVG(spec, pal, 250, 196);
      out += figureSVG(150, 250, 118, pal.accent === '#ffb454' ? '#c33d21' : '#c33d21', { seated: true });
      out += '<rect width="480" height="270" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="10"/></svg>';
      return out;
    }

    if (spec.kind === 'motif') {
      out += '<rect width="480" height="270" fill="#07080b"/>';
      out += '<rect x="0" y="188" width="480" height="82" fill="#04060a"/>';
      out += '<rect x="0" y="184" width="480" height="5" fill="' + pal.accent + '" opacity="0.28"/>';
      out += propSVG(spec, pal, 168, 188, true);
      out += '<path d="M480 270 L480 60 Q 420 84 406 150 L400 270 Z" fill="#04060a"/>';
      out += '<circle cx="436" cy="66" r="17" fill="#04060a"/>';
      out += '<path d="M418 92 L452 92 L446 108 L424 108 Z" fill="#c33d21"/>';
      out += '<rect width="480" height="270" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="10"/></svg>';
      return out;
    }

    /* exterior, signature, closing */
    out += '<rect width="480" height="270" fill="url(#sky' + spec.uid + ')"/>';
    out += skyStars(pal);
    if (dawn) out += '<rect x="0" y="150" width="480" height="60" fill="' + pal.accent + '" opacity="0.16"/>';
    var isSea = spec.landmark === 'lighthouse' || spec.landmark === 'ship';
    if (isSea) {
      out += '<rect x="0" y="196" width="480" height="74" fill="' + pal.sea + '"/>';
      out += '<g stroke="' + pal.paper + '" stroke-opacity="0.18" fill="none"><path d="M8 218 q 20 -7 40 0 t 40 0 t 40 0 t 40 0"/><path d="M180 240 q 20 -7 40 0 t 40 0 t 40 0 t 40 0"/><path d="M40 254 q 20 -6 40 0 t 40 0 t 40 0"/></g>';
    } else {
      out += '<rect x="0" y="216" width="480" height="54" fill="' + pal.ground + '"/>';
    }
    if (spec.kind === 'signature' && spec.landmark === 'lighthouse') {
      out += '<path d="M318 140 L60 96 L60 168 Z" fill="' + pal.accent + '" opacity="0.20"/>';
      out += '<circle cx="70" cy="150" r="5" fill="' + pal.accent + '"/><circle cx="70" cy="150" r="16" fill="url(#glow' + spec.uid + ')"/>';
    }
    if (spec.kind === 'signature' && spec.landmark !== 'lighthouse') {
      out += '<circle cx="96" cy="150" r="6" fill="' + pal.accent + '"/><circle cx="96" cy="150" r="22" fill="url(#glow' + spec.uid + ')"/>';
    }
    out += landmarkSVG(spec.landmark, pal);
    out += figureSVG(spec.kind === 'signature' ? 210 : 120, 262, spec.kind === 'signature' ? 64 : 84, '#c33d21', {});
    out += '<rect width="480" height="270" fill="none" stroke="#000" stroke-opacity="0.3" stroke-width="8"/></svg>';
    return out;
  }

  function propSVG(spec, pal, cx, baseY, big) {
    var kind = spec.propKind;
    if (kind === 'voice') {
      var w = big ? 190 : 104, h = big ? 108 : 60, x = cx - w / 2, y = baseY - h;
      var g = '<g><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="10" fill="#0a0c10" stroke="#232830" stroke-width="2"/>';
      g += '<circle cx="' + (x + w * 0.30) + '" cy="' + (y + h * 0.52) + '" r="' + (h * 0.30) + '" fill="none" stroke="' + pal.accent + '" stroke-width="3"/>';
      g += '<circle cx="' + (x + w * 0.30) + '" cy="' + (y + h * 0.52) + '" r="4" fill="' + pal.accent + '"/>';
      for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
        g += '<circle cx="' + (x + w * 0.62 + c * w * 0.11) + '" cy="' + (y + h * 0.30 + r * h * 0.2) + '" r="2.4" fill="#39404c"/>';
      }
      g += '<path d="M' + (x + w * 0.58) + ' ' + (y + h * 0.82) + ' L' + (x + w * 0.9) + ' ' + (y + h * 0.82) + '" stroke="' + pal.accent + '" stroke-width="2"/>';
      if (big) g += '<path d="M' + (x + w + 14) + ' ' + (y + 8) + ' l 14 12 l -18 8 l 16 10 l -20 8" fill="none" stroke="' + pal.accent + '" stroke-width="3" opacity="0.85"/>';
      return g + '</g>';
    }
    if (kind === 'paper') {
      var pw = big ? 170 : 96, ph = big ? 118 : 66, px = cx - pw / 2, py = baseY - ph - 4;
      var lines = '';
      for (var i = 0; i < 4; i++) lines += '<rect x="' + (px + 16) + '" y="' + (py + 20 + i * (ph * 0.17)) + '" width="' + (pw - 32 - (i % 2) * 24) + '" height="4" fill="#6d675a"/>';
      return '<g transform="rotate(-3 ' + cx + ' ' + baseY + ')"><rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '" fill="#cfc7ae"/><rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '" fill="none" stroke="#8d8570" stroke-width="2"/>' + lines + '</g>';
    }
    /* object */
    var ow = big ? 120 : 70, oh = big ? 120 : 70, ox = cx - ow / 2, oy = baseY - oh;
    return '<g><circle cx="' + cx + '" cy="' + (baseY - oh / 2) + '" r="' + (ow / 2) + '" fill="#0a0c10" stroke="' + pal.accent + '" stroke-width="3"/>' +
      '<circle cx="' + cx + '" cy="' + (baseY - oh / 2) + '" r="' + (ow * 0.16) + '" fill="' + pal.accent + '"/>' +
      '<path d="M' + cx + ' ' + (baseY - oh / 2) + ' L' + cx + ' ' + (baseY - oh + 6) + ' M' + cx + ' ' + (baseY - oh / 2) + ' L' + (cx + ow * 0.3) + ' ' + (baseY - oh / 2 + oh * 0.18) + '" stroke="' + pal.paper + '" stroke-width="4"/></g>';
  }

  function compileFrames(p, a, shotList) {
    var s = p.setting;
    var bible = {
      character: p.name + ', ' + p.protagonist + ', wearing ' + s.wardrobe,
      palette: s.palette.name,
      light: s.light,
      era: 'an undated present; the tools, clothes and equipment are all older than the story'
    };
    var chosen = [0, 2, 5, 8];
    var propKind = p.motif.kind === 'voice' ? 'voice' : (['letter', 'photograph', 'logbook', 'map', 'ticket'].indexOf(p.motif.name) !== -1 ? 'paper' : 'object');
    var frames = chosen.map(function (shotIdx, i) {
      var sh = shotList[shotIdx];
      var spec = {
        uid: 'f' + i, kind: sh.scene, landmark: s.landmark, palette: s.palette,
        propKind: propKind, motifName: p.motif.name
      };
      return {
        frame: i + 1, shot: sh.n, beat: sh.beat,
        prompt: 'Cinematic storyboard frame, live-action film still. ' + sh.description +
          ' Character lock: ' + bible.character + '. Palette lock: ' + bible.palette +
          '. Light: ' + bible.light + '. Framing: ' + sh.size + ', ' + sh.lens + '. Mood: quiet, exact, nothing explained.',
        svg: composeSVG(spec),
        spec: spec
      };
    });
    return { bible: bible, frames: frames };
  }

  /* ---------- studio run + export ---------- */

  function runStudio(rawIdea) {
    var p = parseIdea(rawIdea);
    var a = buildAgents(p);
    var debate = runDebate(p, a);
    var treatment = compileTreatment(p, a);
    var shotList = compileShotList(p, a);
    var framesPack = compileFrames(p, a, shotList);
    return {
      idea: p.raw,
      engine: 'LocalEngine 1.0',
      seed: hashSeed(p.raw.toLowerCase()),
      parsed: {
        protagonist: p.protagonist, role: p.role, setting: p.setting.shortPlace,
        settingId: p.setting.id, motif: p.motif.name, genre: p.genre,
        hook: p.hook, heroName: p.name
      },
      decisions: debate.decisions,
      debate: debate.turns,
      lookBible: framesPack.bible,
      treatment: treatment,
      shotList: shotList,
      frames: framesPack.frames
    };
  }

  function toMarkdown(prod) {
    var L = [];
    L.push('# BACKLOT — Production Packet');
    L.push('');
    L.push('## ' + prod.treatment.title);
    L.push('');
    L.push('**Seed idea:** ' + prod.idea);
    L.push('');
    L.push('**Logline:** ' + prod.treatment.logline);
    L.push('');
    L.push('**Genre:** ' + cap(prod.parsed.genre) + ' · **Setting:** ' + prod.parsed.setting + ' · **Engine:** ' + prod.engine);
    L.push('');
    L.push('## Decision Log');
    L.push('');
    prod.decisions.forEach(function (d) {
      L.push('- **' + d.clash + '** — won by ' + d.winner + ' over ' + d.loser + '. ' + d.why);
    });
    L.push('');
    L.push('## Treatment');
    L.push('');
    L.push('### Synopsis');
    L.push('');
    prod.treatment.synopsis.forEach(function (para) { L.push(para); L.push(''); });
    L.push('### Themes');
    L.push('');
    prod.treatment.themes.forEach(function (t) { L.push('- ' + t); });
    L.push('');
    L.push('### Characters');
    L.push('');
    prod.treatment.characters.forEach(function (c) {
      L.push('- **' + c.name + '** (' + c.role + ') — Wants: ' + c.want + '. Flaw: ' + c.flaw);
    });
    L.push('');
    L.push('## Look Bible');
    L.push('');
    L.push('- **Character lock:** ' + prod.lookBible.character);
    L.push('- **Palette lock:** ' + prod.lookBible.palette);
    L.push('- **Light:** ' + prod.lookBible.light);
    L.push('- **Era:** ' + prod.lookBible.era);
    L.push('');
    L.push('## Shot List');
    L.push('');
    prod.shotList.forEach(function (sh) {
      L.push(sh.n + '. **' + sh.beat + '** — ' + sh.size + ', ' + sh.lens + ', ' + sh.movement + '. ' + sh.description);
    });
    L.push('');
    L.push('## Storyboard Frames');
    L.push('');
    prod.frames.forEach(function (f) {
      L.push('### Frame ' + f.frame + ' (Shot ' + f.shot + ' — ' + f.beat + ')');
      L.push('');
      L.push('Image prompt: ' + f.prompt);
      L.push('');
    });
    L.push('## Debate Transcript');
    L.push('');
    prod.debate.forEach(function (t) {
      L.push('**' + t.agentName + '** (' + t.round + ', ' + t.kind + '): ' + t.text);
      L.push('');
    });
    L.push('---');
    L.push('Generated by Backlot. Previz frames are stylised SVG boards, not photographs.');
    return L.join('\n');
  }

  root.BacklotEngine = {
    parseIdea: parseIdea,
    runStudio: runStudio,
    toMarkdown: toMarkdown,
    AGENTS: AGENTS,
    version: '1.0'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BacklotEngine;
})(typeof window !== 'undefined' ? window : globalThis);
