'use strict';

/* =========================================================================
 * Movement library: a short form cue and a looping stick-figure animation
 * for each move. Poses are joint positions in a 100x100 box (side view,
 * facing right, unless noted as front view). The animation eases between
 * a move's poses in a loop.
 *
 * Points: head, neck (shoulder), hip, k1/f1 = near knee/foot,
 * k2/f2 = far knee/foot, e1/h1 = near elbow/hand, e2/h2 = far elbow/hand,
 * b = kettlebell offset from the hand it's attached to.
 * ========================================================================= */

const MOVES = (() => {
  const P = (base, over) => ({ ...base, ...over });
  const mix = (a, b, t) => {
    const o = {};
    for (const k of Object.keys(a)) o[k] = [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t];
    return o;
  };
  const shift = (p, dx, dy) => {
    const o = {};
    for (const k of Object.keys(p)) o[k] = k === 'b' ? p[k] : [p[k][0] + dx, p[k][1] + dy];
    return o;
  };

  /* ---------- side view ---------- */
  const STAND = {
    head: [50, 14], neck: [50, 24], hip: [50, 51],
    k1: [51, 71], f1: [51, 92], k2: [49, 71], f2: [49, 92],
    e1: [51, 38], h1: [52, 51], e2: [49, 38], h2: [48, 51], b: [0, 6],
  };
  const SWING_LOW = {
    head: [66, 29], neck: [59, 35], hip: [38, 52],
    k1: [45, 71], f1: [49, 92], k2: [44, 71], f2: [48, 92],
    e1: [56, 48], h1: [49, 58], e2: [55, 48], h2: [48, 58], b: [-3, 4],
  };
  const SWING_HIGH = P(STAND, { hip: [51, 51], e1: [62, 28], h1: [75, 27], e2: [61, 28], h2: [74, 27], b: [5, 1] });
  const DL_LOW = {
    head: [67, 41], neck: [60, 46], hip: [36, 60],
    k1: [52, 72], f1: [50, 92], k2: [51, 72], f2: [49, 92],
    e1: [60, 59], h1: [60, 72], e2: [59, 59], h2: [59, 72], b: [0, 6],
  };
  const GOBLET = P(STAND, { e1: [55, 37], h1: [57, 28], e2: [54, 37], h2: [56, 28], b: [4, 5] });
  const SQUAT = {
    head: [50, 36], neck: [47, 46], hip: [36, 72],
    k1: [56, 70], f1: [50, 92], k2: [55, 70], f2: [49, 92],
    e1: [54, 56], h1: [56, 47], e2: [53, 56], h2: [55, 47], b: [4, 5],
  };
  const RACK = P(STAND, { e1: [56, 36], h1: [57, 26], b: [4, 2] });
  const PRESS = P(STAND, { e1: [53, 11], h1: [54, -2], b: [3, -4] });
  const OVERHEAD2 = P(STAND, { e1: [53, 11], h1: [53, -2], e2: [52, 11], h2: [52, -2], b: [0, -5] });
  const LUNGE = {
    head: [48, 32], neck: [47, 42], hip: [46, 69],
    k1: [64, 71], f1: [64, 92], k2: [40, 88], f2: [24, 91],
    e1: [52, 47], h1: [54, 38], e2: [51, 47], h2: [53, 38], b: [4, 5],
  };
  const ROW_LOW = {
    head: [71, 39], neck: [63, 42], hip: [38, 52],
    k1: [46, 71], f1: [49, 92], k2: [45, 71], f2: [48, 92],
    e1: [62, 55], h1: [61, 68], e2: [61, 55], h2: [60, 68], b: [0, 5],
  };
  const ROW_HIGH = P(ROW_LOW, { e1: [50, 38], h1: [53, 51] });
  const ROW1_HIGH = P(ROW_LOW, { e1: [50, 38], h1: [53, 51] , e2: [57, 52], h2: [52, 62] });
  const ROW1_LOW = P(ROW_LOW, { e2: [57, 52], h2: [52, 62] });
  const SLDL = {
    head: [82, 43], neck: [74, 45], hip: [48, 52],
    k1: [30, 49], f1: [11, 47], k2: [50, 72], f2: [50, 92],
    e1: [73, 58], h1: [72, 71], e2: [72, 58], h2: [71, 71], b: [0, 5],
  };
  const HIGHPULL = P(STAND, { e1: [40, 20], h1: [53, 26], e2: [39, 20], h2: [52, 26], b: [2, 4] });
  const CURL_UP = P(STAND, { e1: [51, 38], h1: [59, 29], e2: [50, 38], h2: [58, 29], b: [2, 4] });

  // Planks / floor (head on the right)
  const PUSH_UP = {
    head: [83, 63], neck: [75, 66.5], hip: [50, 77],
    k1: [32, 84.5], f1: [14, 92], k2: [32, 84.5], f2: [14, 92],
    e1: [76, 79], h1: [75, 92], e2: [74, 79], h2: [73, 92], b: [0, 0],
  };
  const PUSH_DOWN = {
    head: [83, 76], neck: [75, 78], hip: [50, 84],
    k1: [32, 88], f1: [14, 92], k2: [32, 88], f2: [14, 92],
    e1: [66, 84], h1: [75, 92], e2: [65, 84], h2: [73, 92], b: [0, 0],
  };
  const PLANK_BELLS = P(PUSH_UP, { e1: [76, 76], h1: [75, 86], e2: [74, 76], h2: [73, 86], b: [0, 4] });
  const RENEGADE_UP = P(PLANK_BELLS, { e1: [62, 60], h1: [66, 74] });
  const FOREARM = {
    head: [80, 71], neck: [72, 73], hip: [50, 80],
    k1: [32, 86], f1: [14, 92], k2: [32, 86], f2: [14, 92],
    e1: [72, 91], h1: [84, 91], e2: [71, 91], h2: [83, 91], b: [0, 0],
  };
  const PULL_A = P(PUSH_UP, { e1: [81, 77], h1: [87, 86], b: [0, 4] });
  const PULL_B = P(PUSH_UP, { e1: [65, 78], h1: [58, 86], b: [0, 4] });
  const CROUCH = {
    head: [65, 46], neck: [58, 52], hip: [40, 74],
    k1: [58, 68], f1: [50, 92], k2: [57, 68], f2: [49, 92],
    e1: [62, 74], h1: [64, 91], e2: [61, 74], h2: [63, 91], b: [0, 0],
  };

  // Lying on back (head on the left)
  const LYING = {
    head: [17, 85], neck: [26, 88], hip: [52, 90],
    k1: [66, 74], f1: [74, 92], k2: [65, 74], f2: [73, 92],
    e1: [36, 90], h1: [46, 91], e2: [35, 90], h2: [45, 91], b: [0, -4],
  };
  const BRIDGE_DOWN = P(LYING, { e1: [36, 84], h1: [48, 86] });
  const BRIDGE_UP = P(LYING, { hip: [52, 76], k1: [69, 73], k2: [68, 73], e1: [38, 80], h1: [50, 72], e2: [36, 89], h2: [46, 90] });
  const BUG_A = P(LYING, {
    e1: [27, 76], h1: [28, 63], e2: [26, 76], h2: [27, 63],
    k1: [52, 70], f1: [72, 70], k2: [51, 70], f2: [71, 70],
  });
  const BUG_B = P(BUG_A, { k1: [71, 85], f1: [91, 86], e2: [14, 86], h2: [2, 86] });
  const FP_DOWN = P(LYING, { e1: [34, 92], h1: [36, 79] });
  const FP_UP = P(LYING, { e1: [27, 75], h1: [28, 62] });
  const GETUP_A = P(LYING, { e1: [27, 75], h1: [28, 62], k2: [72, 91], f2: [92, 92], e2: [33, 92], h2: [40, 93] });
  const GETUP_B = P(GETUP_A, { head: [33, 57], neck: [36, 66], e1: [37, 52], h1: [38, 38], e2: [32, 79], h2: [28, 92] });
  const SEATED = {
    head: [34, 53], neck: [36, 63], hip: [45, 88],
    k1: [62, 72], f1: [76, 84], k2: [61, 72], f2: [75, 84],
    e1: [46, 72], h1: [57, 76], e2: [45, 72], h2: [56, 76], b: [0, 4],
  };
  const SEATED_B = P(SEATED, { e1: [38, 75], h1: [33, 84], e2: [37, 75], h2: [32, 84] });

  /* ---------- front view ---------- */
  const SUMO_STAND = {
    head: [50, 14], neck: [50, 24], hip: [50, 51],
    k1: [40, 71], f1: [33, 92], k2: [60, 71], f2: [67, 92],
    e1: [42, 36], h1: [47, 30], e2: [58, 36], h2: [53, 30], b: [3, 6],
  };
  const SUMO_LOW = {
    head: [50, 33], neck: [50, 43], hip: [50, 70],
    k1: [35, 71], f1: [31, 92], k2: [65, 71], f2: [69, 92],
    e1: [42, 55], h1: [47, 48], e2: [58, 55], h2: [53, 48], b: [3, 6],
  };
  const SUMO_DL_LOW = P(SUMO_LOW, { hip: [50, 72], neck: [50, 46], head: [50, 36], e1: [45, 60], h1: [48, 74], e2: [55, 60], h2: [52, 74], b: [2, 6] });
  const SUMO_PULL = P(SUMO_STAND, { e1: [36, 22], h1: [47, 27], e2: [64, 22], h2: [53, 27], b: [3, 5] });
  const SIDE_LUNGE = {
    head: [41, 33], neck: [40, 43], hip: [38, 70],
    k1: [24, 72], f1: [26, 92], k2: [55, 81], f2: [72, 92],
    e1: [33, 55], h1: [37, 48], e2: [47, 55], h2: [43, 48], b: [3, 6],
  };

  const M = (frames, desc, opt = {}) => ({ frames, desc, bell: 'h1', step: 0.7, ...opt });

  const swing2 = M([SWING_LOW, SWING_HIGH],
    'Hinge at the hips with a flat back, then snap the hips forward to float the bell to chest height. Arms stay loose; the power comes from your glutes.');
  const gobletSquat = M([GOBLET, SQUAT],
    'Hold the bell by the horns at your chest. Sit down between your heels, chest up, knees tracking over toes, then drive up through your whole foot.', { step: 0.9 });

  const lib = {
    'two-hand swing': swing2,
    'single-arm swing': M([P(SWING_LOW, { e2: [55, 46], h2: [62, 54] }), P(SWING_HIGH, { e2: [49, 38], h2: [46, 50] })],
      'Same hip snap as a two-hand swing, one hand on the bell. Keep the shoulders square and don’t let the bell twist you.'),
    'goblet squat': gobletSquat,
    'goblet squat pulse': M([SQUAT, mix(SQUAT, GOBLET, 0.3)],
      'Sit into the bottom of a goblet squat and pulse a few inches up and down. Stay low and keep the chest tall.', { step: 0.45 }),
    'goblet squat thruster': M([GOBLET, SQUAT, OVERHEAD2],
      'Goblet squat down, then drive up hard and use that momentum to press the bell overhead. Lower to the chest as you sit back down.', { step: 0.75 }),
    'sumo squat': M([SUMO_STAND, SUMO_LOW],
      'Wide stance, toes turned out, bell held at the chest. Sit straight down, pushing the knees out, then stand tall.', { step: 0.9 }),
    'kettlebell deadlift': M([STAND, DL_LOW],
      'Bell between your feet. Push the hips back, grip it with a flat back, then stand up by driving the hips forward. Squeeze the glutes at the top.', { step: 0.9 }),
    'single-leg deadlift': M([STAND, SLDL],
      'Stand on one leg with a soft knee. Hinge forward as the free leg reaches back, keeping hips level, then return to standing. Slow and controlled.', { step: 1 }),
    'sumo deadlift high pull': M([SUMO_DL_LOW, P(SUMO_STAND, { e1: [45, 38], h1: [48, 50], e2: [55, 38], h2: [52, 50], b: [2, 6] }), SUMO_PULL],
      'Wide stance, bell between the feet. Stand up explosively and pull the bell to your chin with elbows high and wide, then lower under control.', { step: 0.55 }),
    'reverse lunge & curl': M([STAND, P(LUNGE, { e1: [48, 56], h1: [49, 69], e2: [47, 56], h2: [48, 69], b: [0, 6] }), STAND, CURL_UP],
      'Bell hanging at arm\u2019s length. Step back into a reverse lunge and drive back up, then curl the bell to your chest with elbows tucked. Alternate legs.', { step: 0.8 }),
    'reverse lunge': M([GOBLET, LUNGE],
      'Step one foot back and lower until both knees are about 90°. Front heel stays down; push through it to come back up.', { step: 0.9 }),
    'goblet reverse lunge': M([GOBLET, LUNGE],
      'Bell at the chest. Step back into a lunge, back knee toward the floor, torso upright, then drive through the front heel to stand.', { step: 0.9 }),
    'lateral lunge': M([SUMO_STAND, SIDE_LUNGE],
      'Wide stance, bell at the chest. Sit back into one hip with the other leg straight, then push back to center. Keep the feet flat.', { step: 0.9 }),
    'glute bridge': M([BRIDGE_DOWN, BRIDGE_UP],
      'Lie on your back, knees bent, bell resting on your hips. Drive through the heels to lift the hips until your body is a straight line, squeeze, lower.', { step: 0.8 }),
    'single-arm row': M([ROW1_LOW, ROW1_HIGH],
      'Hinge forward with a flat back, free hand braced on your thigh. Pull the bell to your hip, elbow close to your side, then lower fully.', { step: 0.8 }),
    'bent-over row': M([ROW_LOW, ROW_HIGH],
      'Hinge forward with a flat back, bell hanging below your shoulders. Row it to your belly button, squeeze the shoulder blades, lower slowly.', { step: 0.8 }),
    'renegade row': M([PLANK_BELLS, RENEGADE_UP],
      'High plank, feet wide, one hand on the bell. Row it to your ribs without letting the hips twist or sag, set it down with control, switch sides.', { step: 0.8 }),
    'halo': M([GOBLET, P(GOBLET, { e1: [58, 18], h1: [55, 6], e2: [57, 18], h2: [54, 6] }), P(GOBLET, { e1: [57, 16], h1: [42, 12], e2: [56, 16], h2: [41, 12] }), P(GOBLET, { e1: [44, 20], h1: [46, 8], e2: [43, 20], h2: [45, 8] })],
      'Hold the bell upside down by the horns. Circle it slowly around your head, close to your neck. Keep the ribs down and switch direction each time.', { step: 0.5, bell: 'h1' }),
    'clean & press': M([SWING_LOW, RACK, PRESS, RACK],
      'Swing the bell back, then pull it up close to your body to the rack at your shoulder. Press it straight overhead, lower to the rack, repeat.', { step: 0.65 }),
    'overhead press': M([RACK, PRESS],
      'From the rack at your shoulder, brace your core and press straight up until the arm is locked out by your ear. Lower back to the rack.', { step: 0.8 }),
    'high pull': M([SWING_LOW, HIGHPULL],
      'Hinge and drive the hips like a swing, then pull the bell to chest height with the elbow high and back. Let it fall back between the legs.', { step: 0.6 }),
    'snatch': M([SWING_LOW, PRESS],
      'Swing the bell back, then drive the hips and pull it straight up close to the body, punching your hand through to lock out overhead.', { step: 0.65 }),
    'floor press': M([FP_DOWN, FP_UP],
      'Lie on your back, knees bent, upper arm on the floor. Press the bell straight up over your shoulder, then lower until the elbow touches down.', { step: 0.8 }),
    'bicep curl': M([STAND, CURL_UP],
      'Stand tall, elbows tucked at your sides. Curl the bell up to your chest without swinging, then lower slowly.', { step: 0.8 }),
    'push-up': M([PUSH_UP, PUSH_DOWN],
      'Hands under the shoulders, body in a straight line. Lower your chest toward the floor, elbows at about 45°, then push away. Drop to the knees if needed.', { step: 0.8, bell: null }),
    'plank': M([FOREARM, P(FOREARM, { hip: [50, 78] })],
      'Forearms under the shoulders, body straight from head to heels. Squeeze the glutes, brace the abs and breathe. Don’t let the hips sag.', { step: 1.5, bell: null }),
    'plank pull-through': M([PULL_A, PULL_B],
      'High plank with the bell beside you. Reach under your body with the opposite hand and drag the bell across. Keep the hips still.', { step: 0.8 }),
    'dead bug': M([BUG_A, BUG_B],
      'On your back, arms up, knees over hips. Press your lower back into the floor and slowly extend the opposite arm and leg, then return and switch.', { step: 1, bell: null }),
    'russian twist': M([SEATED, SEATED_B],
      'Sit leaning back with a long spine, feet down (or lifted for harder). Hold the bell at your chest and rotate side to side, turning from your ribs.', { step: 0.6 }),
    'half get-up': M([GETUP_A, GETUP_B],
      'Lie down with the bell pressed up over your shoulder. Roll up onto the opposite elbow, then hand, keeping your eyes and arm on the bell. Reverse slowly.', { step: 1.2 }),
    'burpee': M([STAND, CROUCH, PUSH_UP, CROUCH, P(shift(STAND, 0, -6), { e1: [52, 12], h1: [53, 0], e2: [49, 12], h2: [48, 0] })],
      'Squat and put your hands down, jump the feet back to a plank, jump them back in, then stand and jump with arms overhead.', { step: 0.45, bell: null }),
  };

  const alias = {
    'swing': 'two-hand swing', 'kettlebell swing': 'two-hand swing', 'russian swing': 'two-hand swing',
    'one-arm swing': 'single-arm swing', 'squat to press': 'goblet squat thruster',
    'squat and press': 'goblet squat thruster', 'plank row': 'renegade row',
    'lunge & curl': 'reverse lunge & curl', 'lunge and curl': 'reverse lunge & curl',
    'reverse lunge and curl': 'reverse lunge & curl', 'squat': 'goblet squat', 'thruster': 'goblet squat thruster',
    'deadlift': 'kettlebell deadlift', 'romanian deadlift': 'kettlebell deadlift', 'rdl': 'kettlebell deadlift',
    'single leg deadlift': 'single-leg deadlift', 'lunge': 'reverse lunge', 'side lunge': 'lateral lunge',
    'row': 'bent-over row', 'clean and press': 'clean & press', 'press': 'overhead press',
    'military press': 'overhead press', 'curl': 'bicep curl', 'pushup': 'push-up', 'push up': 'push-up',
    'bridge': 'glute bridge', 'hip thrust': 'glute bridge', 'get-up': 'half get-up', 'getup': 'half get-up',
    'turkish get-up': 'half get-up', 'twist': 'russian twist', 'chest press': 'floor press',
  };

  function normalize(name) {
    return String(name || '').toLowerCase()
      .replace(/\(.*?\)/g, ' ')
      .replace(/[–—]/g, '-')
      .replace(/\s-\s*(left|right|alternating|alt|l|r|each side)\b.*$/, '')
      .replace(/\b(left|right|alternating)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  const keys = [...Object.keys(lib), ...Object.keys(alias)].sort((a, b) => b.length - a.length);

  const cache = new Map();
  function find(name) {
    if (!cache.has(name)) cache.set(name, lookup(name));
    return cache.get(name);
  }

  // Try as written, then with plurals dropped ("KB swings" -> "kb swing").
  function lookup(name) {
    const n = normalize(name);
    return match(n) || match(n.replace(/([a-z])s\b/g, '$1'));
  }

  function match(n) {
    if (!n) return null;
    const direct = lib[n] || lib[alias[n]];
    if (direct) return direct;
    // Fall back to the longest known move name contained in the text.
    for (const k of keys) {
      if (new RegExp('(^|[^a-z])' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)').test(n)) {
        return lib[k] || lib[alias[k]];
      }
    }
    return null;
  }

  return { find, lib };
})();

/* -------------------------- animator ----------------------------------- */

class MoveFigure {
  /* An original fantasy warrior (crested helm, cape, glowing ember
   * kettlebell) doing the move, while an "ash gremlin" stands opposite and
   * gets knocked back with a spark on each rep. */
  constructor(svg) {
    this.svg = svg;
    this.move = null;
    this.t0 = performance.now();
    this.raf = 0;
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (tag, attrs, parent = svg) => {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      parent.append(el);
      return el;
    };
    svg.setAttribute('viewBox', '-5 -12 138 110');

    // Ground: scorched earth with a few rocks
    mk('path', { d: 'M-5,94 L133,94 L133,98 L-5,98 Z', class: 'fig-earth' });
    mk('path', { d: 'M10,94 l3,-2 l4,2 Z M60,94 l2,-1.5 l3,1.5 Z M98,94 l3,-2.5 l4,2.5 Z', class: 'fig-rock' });

    // Foe
    this.foe = mk('g', { class: 'fig-foe' });
    mk('path', { d: 'M-4,-17 L-8,-26 L-1.5,-18.5 Z M3,-17 L7,-26 L0.5,-18.5 Z', class: 'foe-horn' }, this.foe);
    mk('path', { d: 'M-10,0 Q-12,-12 -5,-17.5 Q-0.5,-21.5 4.5,-17.5 Q11,-12 9,0 Q4,-2 0,0 Q-5,-2 -10,0 Z', class: 'foe-body' }, this.foe);
    mk('path', { d: 'M-9,-8 L-15,-11 M-15,-11 l-1.5,-2.5 M-15,-11 l-2.5,0.5', class: 'foe-arm' }, this.foe);
    mk('circle', { cx: -5, cy: -12, r: 1.5, class: 'foe-eye' }, this.foe);
    mk('circle', { cx: -0.5, cy: -12, r: 1.5, class: 'foe-eye' }, this.foe);
    mk('path', { d: 'M-6.5,-7.5 l1.5,1.2 l1.2,-1.2 l1.2,1.2 l1.2,-1.2', class: 'foe-mouth' }, this.foe);

    this.spark = mk('path', {
      d: 'M0,-7 L1.8,-1.8 L7,0 L1.8,1.8 L0,7 L-1.8,1.8 L-7,0 L-1.8,-1.8 Z',
      class: 'fig-spark',
    });

    // Warrior (back to front)
    this.cape = mk('path', { class: 'fig-cape' });
    this.farLeg = mk('polyline', { class: 'fig-limb fig-far' });
    this.farArm = mk('polyline', { class: 'fig-limb fig-far' });
    this.torso = mk('line', { class: 'fig-limb fig-torso' });
    this.nearLeg = mk('polyline', { class: 'fig-limb' });
    this.headG = mk('g', {});
    mk('circle', { r: 6, class: 'fig-head' }, this.headG);
    mk('path', { d: 'M-6.8,1.5 A6.8,6.8 0 0 1 6.8,1.5 L6.8,3.2 L-6.8,3.2 Z', class: 'fig-helm' }, this.headG);
    mk('path', { d: 'M1.5,0.2 L6.8,0.2', class: 'fig-visor' }, this.headG);
    mk('path', { d: 'M-5,-5 Q-1,-12.5 6,-8', class: 'fig-crest' }, this.headG);
    this.bell = mk('g', { class: 'fig-bell' });
    mk('circle', { r: 8, class: 'fig-glow' }, this.bell);
    mk('circle', { r: 2.6, cy: -3.6, class: 'fig-handle' }, this.bell);
    mk('circle', { r: 4.4, class: 'fig-orb' }, this.bell);
    this.nearArm = mk('polyline', { class: 'fig-limb' });
  }

  set(move) {
    if (move === this.move) return;
    this.move = move;
    this.t0 = performance.now();
    this.svg.style.display = move ? '' : 'none';
    if (move) this.start(); else this.stop();
  }

  start() {
    cancelAnimationFrame(this.raf);
    const step = (now) => {
      if (!this.move) return;
      this.draw(now);
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }

  draw(now) {
    const m = this.move;
    const n = m.frames.length;
    const secs = (now - this.t0) / 1000;
    const t = secs / m.step;
    const i = Math.floor(t) % n;
    const f = t - Math.floor(t);
    // Ease in-out with a short hold at each pose.
    const hold = 0.15;
    const u = f < hold ? 0 : (f - hold) / (1 - hold);
    const e = 0.5 - 0.5 * Math.cos(Math.PI * u);
    const a = m.frames[i];
    const b = m.frames[(i + 1) % n];
    const p = (k) => [a[k][0] + (b[k][0] - a[k][0]) * e, a[k][1] + (b[k][1] - a[k][1]) * e];
    const pt = (...ks) => ks.map((k) => p(k).join(',')).join(' ');

    const neck = p('neck'), hip = p('hip'), head = p('head');
    this.farLeg.setAttribute('points', pt('hip', 'k2', 'f2'));
    this.farArm.setAttribute('points', pt('neck', 'e2', 'h2'));
    this.nearLeg.setAttribute('points', pt('hip', 'k1', 'f1'));
    this.nearArm.setAttribute('points', pt('neck', 'e1', 'h1'));
    this.torso.setAttribute('x1', neck[0]); this.torso.setAttribute('y1', neck[1]);
    this.torso.setAttribute('x2', hip[0]); this.torso.setAttribute('y2', hip[1]);

    // Helm turns with the body (upright, plank, lying).
    const ang = Math.atan2(head[1] - hip[1], head[0] - hip[0]) * 180 / Math.PI + 90;
    this.headG.setAttribute('transform', `translate(${head[0]},${head[1]}) rotate(${ang})`);

    // Cape hangs from the shoulders along the back and flutters.
    const fl = Math.sin(secs * 5) * 1.6;
    const dx = hip[0] - neck[0], dy = hip[1] - neck[1];
    const end = [hip[0] + dx * 0.25 - 4 + fl, hip[1] + dy * 0.25 + 3];
    const ctl = [(neck[0] + hip[0]) / 2 - 7 + fl, (neck[1] + hip[1]) / 2 + 2];
    this.cape.setAttribute('d', `M${neck[0] - 1},${neck[1]} Q${ctl[0]},${ctl[1]} ${end[0]},${end[1]} ` +
      `L${end[0] + 4},${end[1] + 1} Q${ctl[0] + 6},${ctl[1]} ${neck[0] + 1},${neck[1] + 1} Z`);

    if (m.bell) {
      const h = p(m.bell), off = p('b');
      this.bell.style.display = '';
      this.bell.setAttribute('transform', `translate(${h[0] + off[0]},${h[1] + off[1]})`);
    } else {
      this.bell.style.display = 'none';
    }

    // The rep "lands" as the warrior reaches the second pose.
    const hit = i === 0 ? e : (i === 1 ? Math.max(0, 1 - e * 1.6) : 0);
    const bob = Math.sin(secs * 3.2) * 0.8;
    this.foe.setAttribute('transform', `translate(${117 + hit * 9},${94 + bob * (1 - hit)}) rotate(${hit * 18})`);
    const sp = Math.max(0, (hit - 0.75) * 4);
    this.spark.style.opacity = sp.toFixed(2);
    this.spark.setAttribute('transform', `translate(${104 + hit * 6},${78}) scale(${0.6 + sp * 0.7}) rotate(${secs * 200})`);
  }
}
