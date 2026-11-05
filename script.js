'use strict';
/* =====================================================================
   인간·로봇 구조 시뮬레이터
   -----------------------------------------------------------------
   1부  시뮬레이션 모델 (화면과 무관한 순수 계산)
   2부  화면 그리기와 조작

   기본 단위: 1칸 = 5 m, 1틱(한 번의 step) = 1분
   ===================================================================== */

/* =====================================================================
   1부. 시뮬레이션 모델
   ===================================================================== */

const W = 36;            // 지도 가로 칸 수
const H = 24;            // 지도 세로 칸 수
const N = W * H;         // 전체 칸 수
const FREE = 0, RUBBLE = 1, WALL = 2;   // 칸 종류

const TEAM_KEYS = ['human', 'robot', 'hybrid'];
const TEAM_NAMES = { human: '인간 팀', robot: '로봇 팀', hybrid: '협업 팀' };
const TEAM_SHORT = { human: '인간', robot: '로봇', hybrid: '협업' };

/* 실험에서 바꿔 볼 수 있는 모든 가정값.
   def는 기본값이고, 화면의 4단계 입력칸이 이 목록으로 만들어집니다. */
const PARAMS = [
  { group: 'site', key: 'victims', label: '요구조자 수', unit: '명', def: 20, min: 5, max: 40, step: 1 },
  { group: 'site', key: 'teamSize', label: '팀 인원', unit: '명', def: 6, min: 2, max: 12, step: 1,
    note: '협업 팀은 로봇과 사람을 절반씩 둬요. 홀수면 로봇이 1대 더 많아요.' },
  { group: 'site', key: 'timeLimit', label: '제한 시간', unit: '분', def: 240, min: 60, max: 480, step: 10 },
  { group: 'site', key: 'lifeMean', label: '평균 생존 가능 시간', unit: '분', def: 180, min: 60, max: 360, step: 10,
    note: '사고 직후 몇 시간을 다루려고 정한 가정이에요. 실제 생존 시간은 부상, 물, 공기에 따라 훨씬 길 수 있어요.' },
  { group: 'site', key: 'lifeSd', label: '생존 가능 시간 편차', unit: '분', def: 60, min: 0, max: 120, step: 5 },
  { group: 'site', key: 'hazardLife', label: '위험 구역의 생존 시간 추가 소모', unit: '배', def: 1, min: 0, max: 3, step: 0.1,
    note: '1이면 위험도 100%인 곳에서 생존 시간이 2배 빨리 줄어요.' },
  { group: 'site', key: 'rubbleRescue', label: '잔해 속 구조 시간 배수', unit: '배', def: 1.5, min: 1, max: 3, step: 0.1 },

  { group: 'human', key: 'hFree', label: '평지 이동', unit: '분/칸', def: 0.5, min: 0.2, max: 3, step: 0.1 },
  { group: 'human', key: 'hRubble', label: '잔해 이동', unit: '분/칸', def: 2, min: 0.5, max: 8, step: 0.1 },
  { group: 'human', key: 'hRange', label: '탐지 반경', unit: '칸', def: 2, min: 1, max: 6, step: 1 },
  { group: 'human', key: 'hDetect', label: '발견 확률', unit: '%', def: 90, min: 10, max: 100, step: 1 },
  { group: 'human', key: 'hRescue', label: '구조 작업 시간', unit: '분', def: 12, min: 2, max: 60, step: 1 },
  { group: 'human', key: 'hSuccess', label: '구조 성공률', unit: '%', def: 95, min: 10, max: 100, step: 1 },
  { group: 'human', key: 'hLimit', label: '진입 한계 위험도', unit: '%', def: 60, min: 0, max: 100, step: 5,
    note: '이 값을 넘는 구역에는 사람이 들어가지 않아요.' },
  { group: 'human', key: 'hInjury', label: '위험도 100%의 분당 부상 확률', unit: '%', def: 1, min: 0, max: 5, step: 0.05,
    note: '실제 확률은 위험도의 제곱에 비례해요. 위험도 50%면 이 값의 4분의 1이에요.' },
  { group: 'human', key: 'hWork', label: '연속 활동 시간', unit: '분', def: 120, min: 30, max: 240, step: 5 },
  { group: 'human', key: 'hDrain', label: '위험 구역 체력 소모', unit: '배', def: 3, min: 1, max: 6, step: 0.5,
    note: '30분 정격 공기호흡기가 현장형 훈련에서 평균 12~16분 지속됐다는 자료를 참고했어요.' },
  { group: 'human', key: 'hRest', label: '휴식 시간', unit: '분', def: 20, min: 5, max: 60, step: 5 },

  { group: 'robot', key: 'rFree', label: '평지 이동', unit: '분/칸', def: 0.6, min: 0.2, max: 3, step: 0.1 },
  { group: 'robot', key: 'rRubble', label: '잔해 이동', unit: '분/칸', def: 3, min: 0.5, max: 10, step: 0.1 },
  { group: 'robot', key: 'rRange', label: '탐지 반경', unit: '칸', def: 3, min: 1, max: 6, step: 1 },
  { group: 'robot', key: 'rDetect', label: '발견 확률', unit: '%', def: 80, min: 10, max: 100, step: 1 },
  { group: 'robot', key: 'rRescue', label: '구조 작업 시간', unit: '분', def: 30, min: 2, max: 90, step: 1,
    note: 'DARPA 대회 우승 로봇도 8개 과제에 44분 28초가 걸렸어요. 사람의 2.5배로 가정했어요.' },
  { group: 'robot', key: 'rSuccess', label: '구조 성공률', unit: '%', def: 50, min: 5, max: 100, step: 1,
    note: '로봇이 혼자 사람을 구조해 내는 기술을 가정한 값이에요. 실패하면 처음부터 다시 시도해요.' },
  { group: 'robot', key: 'rFail', label: '분당 고장 확률', unit: '%', def: 0.1, min: 0, max: 2, step: 0.01,
    note: '잔해 위에서 2배, 위험도 100%에서 추가로 2배가 돼요.' },
  { group: 'robot', key: 'rWork', label: '배터리 사용 시간', unit: '분', def: 90, min: 20, max: 240, step: 5,
    note: '4족 보행 로봇 Spot의 평균 작동 시간 약 90분을 참고했어요.' },
  { group: 'robot', key: 'rRest', label: '배터리 교체 시간', unit: '분', def: 15, min: 1, max: 60, step: 1 }
];

function defaultParams() {
  const p = {};
  PARAMS.forEach(item => { p[item.key] = item.def; });
  return p;
}

/* ---------- 재현 가능한 난수 ----------
   Math.random() 대신 씨앗(seed)이 있는 난수를 씁니다.
   같은 현장 번호를 넣으면 언제나 같은 현장이 만들어집니다. */
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng) {
  const a = Math.max(rng(), 1e-9);
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * rng());
}

function idx(x, y) { return y * W + x; }
function manhattan(a, b) {
  return Math.abs((a % W) - (b % W)) + Math.abs(Math.floor(a / W) - Math.floor(b / W));
}

/* 칸마다 상하좌우 이웃을 미리 계산해 둡니다. */
const ADJ = new Int16Array(N * 4).fill(-1);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const c = idx(x, y) * 4;
    if (x > 0) ADJ[c] = idx(x - 1, y);
    if (x < W - 1) ADJ[c + 1] = idx(x + 1, y);
    if (y > 0) ADJ[c + 2] = idx(x, y - 1);
    if (y < H - 1) ADJ[c + 3] = idx(x, y + 1);
  }
}

/* ---------- 다익스트라 최단 경로 ----------
   start에서 모든 칸까지 걸리는 시간(dist)과
   바로 앞 칸(prev)을 구합니다. 힙은 대기열을 빠르게 정렬하는 자료구조입니다. */
const heapCell = new Int32Array(N * 5);
const heapKey = new Float64Array(N * 5);
let heapSize = 0;

function heapPush(cell, key) {
  let i = heapSize++;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heapKey[parent] <= key) break;
    heapKey[i] = heapKey[parent];
    heapCell[i] = heapCell[parent];
    i = parent;
  }
  heapKey[i] = key;
  heapCell[i] = cell;
}

function heapPop() {
  const top = heapCell[0];
  heapSize--;
  if (heapSize > 0) {
    const key = heapKey[heapSize];
    const cell = heapCell[heapSize];
    let i = 0;
    for (;;) {
      let child = 2 * i + 1;
      if (child >= heapSize) break;
      if (child + 1 < heapSize && heapKey[child + 1] < heapKey[child]) child++;
      if (heapKey[child] >= key) break;
      heapKey[i] = heapKey[child];
      heapCell[i] = heapCell[child];
      i = child;
    }
    heapKey[i] = key;
    heapCell[i] = cell;
  }
  return top;
}

function dijkstra(start, cost, dist, prev, stopAt) {
  dist.fill(Infinity);
  dist[start] = 0;
  prev[start] = -1;
  heapSize = 0;
  heapPush(start, 0);
  while (heapSize > 0) {
    const key = heapKey[0];
    const c = heapPop();
    if (key > dist[c]) continue;
    if (stopAt && stopAt(c, key)) return;   // 필요한 칸을 찾으면 일찍 끝내 속도를 높입니다.
    for (let k = 0; k < 4; k++) {
      const next = ADJ[c * 4 + k];
      if (next < 0) continue;
      const step = cost[next];
      if (step === Infinity) continue;
      const d = key + step;
      if (d < dist[next]) {
        dist[next] = d;
        prev[next] = c;
        heapPush(next, d);
      }
    }
  }
}

const DIST = new Float64Array(N);   // 길찾기 결과를 담는 공용 배열
const PREV = new Int32Array(N);
const CROWD = new Uint8Array(N);    // 다른 대원이 향하는 구역 표시

/* 거친 격자에 난수를 놓고 부드럽게 이어, 뭉친 모양의 잔해를 만듭니다. */
function smoothNoise(rng, size) {
  const gw = Math.ceil(W / size) + 2;
  const gh = Math.ceil(H / size) + 2;
  const grid = new Float32Array(gw * gh);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const out = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gx = x / size, gy = y / size;
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const fx = gx - x0, fy = gy - y0;
      const a = grid[y0 * gw + x0], b = grid[y0 * gw + x0 + 1];
      const c = grid[(y0 + 1) * gw + x0], d = grid[(y0 + 1) * gw + x0 + 1];
      out[idx(x, y)] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    }
  }
  return out;
}

function disc(radius) {
  const list = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius + 1) list.push([dx, dy]);
    }
  }
  return list;
}

/* ---------- 현장 만들기 ----------
   cond.hazard(위험도)와 cond.rubble(잔해 밀도)만 달라지고,
   같은 seed라면 벽, 위험 구역 위치, 요구조자 위치는 그대로입니다.
   그래서 조건을 바꿔도 공정하게 비교할 수 있습니다. */
function makeSite(seed, cond, p) {
  const rng = makeRng(seed);
  const type = new Uint8Array(N);
  const base = idx(W >> 1, H - 1);

  // 무너진 벽 조각을 흩어 놓습니다.
  for (let i = 0; i < 14; i++) {
    const across = rng() < 0.5;
    const len = 4 + Math.floor(rng() * 8);
    const x0 = Math.floor(rng() * W);
    const y0 = Math.floor(rng() * H);
    for (let k = 0; k < len; k++) {
      const x = across ? x0 + k : x0;
      const y = across ? y0 : y0 + k;
      if (x < W && y < H) type[idx(x, y)] = WALL;
    }
  }
  for (let c = 0; c < N; c++) if (manhattan(c, base) <= 3) type[c] = FREE;

  // 지휘소와 이어지지 않는 칸은 벽으로 처리합니다.
  const seen = new Uint8Array(N);
  const stack = [base];
  seen[base] = 1;
  while (stack.length) {
    const c = stack.pop();
    for (let k = 0; k < 4; k++) {
      const next = ADJ[c * 4 + k];
      if (next >= 0 && !seen[next] && type[next] !== WALL) {
        seen[next] = 1;
        stack.push(next);
      }
    }
  }
  const open = [];
  for (let c = 0; c < N; c++) {
    if (seen[c]) open.push(c);
    else type[c] = WALL;
  }

  // 잔해: 노이즈 점수가 높은 칸부터 정해진 비율만큼 덮습니다.
  const coarse = smoothNoise(rng, 6);
  const fine = smoothNoise(rng, 2);
  const score = new Float32Array(N);
  for (let c = 0; c < N; c++) score[c] = coarse[c] * 0.7 + fine[c] * 0.3;
  const order = open.filter(c => manhattan(c, base) > 2).sort((a, b) => score[b] - score[a]);
  const rubbleCount = Math.round(order.length * cond.rubble / 100);
  for (let i = 0; i < rubbleCount; i++) type[order[i]] = RUBBLE;

  // 위험 구역: 위험원 3곳에서 멀어질수록 위험도가 낮아집니다.
  // 위험도가 오르면 위험의 세기(level)와 퍼지는 넓이(spread)가 함께 커집니다.
  const level = cond.hazard / 100;
  const spread = 0.6 + 0.8 * level;
  const sources = [];
  for (let i = 0; i < 3; i++) {
    sources.push({ x: 3 + rng() * (W - 6), y: 2 + rng() * (H - 10), s: 4 + rng() * 2 });
  }
  const hazard = new Float32Array(N);
  for (let c = 0; c < N; c++) {
    const x = c % W, y = Math.floor(c / W);
    let f = 0;
    sources.forEach(src => {
      const d2 = (x - src.x) ** 2 + (y - src.y) ** 2;
      const width = src.s * spread;
      f = Math.max(f, Math.exp(-d2 / (2 * width * width)));
    });
    hazard[c] = f * Math.min(1, manhattan(c, base) / 8) * level;
  }

  // 요구조자: 위치와 생존 가능 시간을 정합니다.
  const spots = open.filter(c => manhattan(c, base) >= 5);
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  const victims = [];
  for (let i = 0; i < p.victims && i < spots.length; i++) {
    const life = Math.max(30, p.lifeMean + p.lifeSd * gaussian(rng));
    victims.push({ cell: spots[i], life });
  }

  // 대원 종류별로 칸마다 드는 이동 시간을 계산합니다.
  const limit = p.hLimit / 100;
  const cost = { human: new Float32Array(N), robot: new Float32Array(N) };
  const plan = { human: new Float32Array(N), robot: cost.robot };
  const noGo = new Uint8Array(N);
  for (let c = 0; c < N; c++) {
    if (type[c] === WALL) {
      cost.human[c] = cost.robot[c] = plan.human[c] = Infinity;
      continue;
    }
    const rubble = type[c] === RUBBLE;
    cost.robot[c] = rubble ? p.rRubble : p.rFree;
    if (hazard[c] > limit) {
      noGo[c] = 1;
      cost.human[c] = plan.human[c] = Infinity;
    } else {
      cost.human[c] = rubble ? p.hRubble : p.hFree;
      plan.human[c] = cost.human[c] * (1 + 4 * hazard[c]);  // 사람은 위험한 길을 돌아갑니다.
    }
  }

  // 각 칸에서 지휘소까지 돌아가는 데 걸리는 시간
  const toBase = { human: new Float64Array(N), robot: new Float64Array(N) };
  dijkstra(base, cost.human, DIST, PREV);
  toBase.human.set(DIST);
  dijkstra(base, cost.robot, DIST, PREV);
  toBase.robot.set(DIST);

  return {
    seed, cond, type, hazard, noGo, base, open, victims, cost, plan, toBase,
    range: { human: disc(p.hRange), robot: disc(p.rRange) }
  };
}

function teamMembers(team, size) {
  if (team === 'human') return Array(size).fill('human');
  if (team === 'robot') return Array(size).fill('robot');
  const robots = Math.ceil(size / 2);
  return Array(robots).fill('robot').concat(Array(size - robots).fill('human'));
}

/* ---------- 시뮬레이션 한 판 ----------
   한 팀이 현장 하나를 맡아 1분씩 진행합니다. step()이 1분입니다. */
class Sim {
  constructor(site, team, p, seed) {
    this.site = site;
    this.team = team;
    this.p = p;
    this.rng = makeRng((seed * 31 + TEAM_KEYS.indexOf(team) * 1009) >>> 0);
    this.t = 0;
    this.done = false;
    this.sweep = 1;                       // 전체 수색 회차 (최대 2회)
    this.searched = new Uint8Array(N);    // 수색한 칸 표시
    this.victimAt = new Int16Array(N).fill(-1);
    this.victims = site.victims.map((v, i) => {
      this.victimAt[v.cell] = i;
      return { cell: v.cell, life: v.life, found: false, rescued: false, dead: false, claim: null };
    });
    this.rescueTimes = [];
    this.injured = 0;
    this.broken = 0;
    this.exposure = 0;                    // 사람이 위험 구역에 머문 시간(인·분)
    this.failed = 0;                      // 구조 실패 횟수
    this.agents = teamMembers(team, p.teamSize).map(kind => ({
      kind,
      cell: site.base,
      state: 'idle',      // idle 대기, move 이동, rescue 구조, rest 휴식, out 이탈
      task: null,         // explore 수색, rescue 구조, base 복귀
      path: [], pathI: 0, goal: -1,
      budget: 0,          // 이동에 쓸 수 있는 누적 시간
      timer: 0,
      energy: kind === 'human' ? p.hWork : p.rWork,
      maxEnergy: kind === 'human' ? p.hWork : p.rWork,
      victim: null,
      wait: 0,
      noWork: false
    }));
    this.agents.forEach(a => this.sense(a));
  }

  /* 탐지 반경 안의 칸을 수색합니다. 처음 살피는 칸에 요구조자가 있으면
     발견 확률에 따라 찾아냅니다. 놓치면 2회차 수색에서 다시 기회가 옵니다. */
  sense(a) {
    const chance = (a.kind === 'human' ? this.p.hDetect : this.p.rDetect) / 100;
    const ax = a.cell % W, ay = Math.floor(a.cell / W);
    const offsets = this.site.range[a.kind];
    for (let i = 0; i < offsets.length; i++) {
      const x = ax + offsets[i][0], y = ay + offsets[i][1];
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const c = idx(x, y);
      if (this.searched[c]) continue;
      this.searched[c] = 1;
      const id = this.victimAt[c];
      if (id >= 0) {
        const v = this.victims[id];
        if (!v.found && !v.dead && this.rng() < chance) v.found = true;
      }
    }
  }

  release(a) {
    if (a.victim) a.victim.claim = null;
    a.victim = null;
  }

  knockOut(a, reason) {
    this.release(a);
    a.state = 'out';
    a.task = null;
    a.path = [];
    if (reason === 'injured') this.injured++;
    else this.broken++;
  }

  rescueTime(a, v) {
    const base = a.kind === 'human' ? this.p.hRescue : this.p.rRescue;
    return base * (this.site.type[v.cell] === RUBBLE ? this.p.rubbleRescue : 1);
  }

  setPath(a, goal, task) {
    const path = [];
    for (let c = goal; c !== a.cell; c = PREV[c]) path.push(c);
    path.reverse();
    a.path = path;
    a.pathI = 0;
    a.goal = goal;
    a.task = task;
    a.state = 'move';
    a.noWork = false;
  }

  goBase(a) {
    this.release(a);
    dijkstra(a.cell, this.site.plan[a.kind], DIST, PREV);
    this.setPath(a, this.site.base, 'base');
  }

  needsReturn(a) {
    return a.energy <= this.site.toBase[a.kind][a.cell] * 1.2 + 5;
  }

  /* 협업 팀의 역할 분담: 로봇은 사람이 갈 수 없는 곳의 요구조자를 맡습니다.
     구조 대기자가 남은 사람 수보다 많으면 로봇도 구조를 돕습니다. */
  robotMayRescue(v) {
    if (this.site.toBase.human[v.cell] === Infinity) return true;
    const humans = this.agents.filter(a => a.kind === 'human' && a.state !== 'out').length;
    const waiting = this.victims.filter(u => u.found && !u.rescued && !u.dead && !u.claim).length;
    return waiting > humans;
  }

  pickVictim(a, force) {
    const shared = this.team === 'hybrid' && a.kind === 'robot' && !force;
    let best = null, bestDist = Infinity;
    for (const v of this.victims) {
      if (!v.found || v.rescued || v.dead || v.claim) continue;
      const d = DIST[v.cell];
      if (d === Infinity || d >= bestDist) continue;
      if (shared && !this.robotMayRescue(v)) continue;
      best = v;
      bestDist = d;
    }
    return best;
  }

  /* 아직 수색하지 않은 가장 가까운 칸을 고릅니다.
     다른 대원이 향하는 구역은 피해서 수색이 겹치지 않게 합니다. */
  pickFrontier(a) {
    const site = this.site;
    const limit = this.team === 'hybrid' && a.kind === 'human' ? 0.2 : Infinity;
    const marks = [];
    for (const other of this.agents) {
      if (other === a || other.task !== 'explore') continue;
      const gx = other.goal % W, gy = Math.floor(other.goal / W);
      for (let y = Math.max(0, gy - 4); y <= Math.min(H - 1, gy + 4); y++) {
        for (let x = Math.max(0, gx - 4); x <= Math.min(W - 1, gx + 4); x++) {
          const c = idx(x, y);
          if (!CROWD[c]) { CROWD[c] = 1; marks.push(c); }
        }
      }
    }
    let best = -1, bestScore = Infinity;
    dijkstra(a.cell, site.plan[a.kind], DIST, PREV, (c, d) => {
      if (d >= bestScore) return true;
      if (!this.searched[c] && site.type[c] !== WALL && site.hazard[c] <= limit) {
        const score = d + (CROWD[c] ? 12 : 0);
        if (score < bestScore) { bestScore = score; best = c; }
      }
      return false;
    });
    for (let i = 0; i < marks.length; i++) CROWD[marks[i]] = 0;
    return best;
  }

  waitingVictims() {
    return this.victims.some(v => v.found && !v.rescued && !v.dead && !v.claim);
  }

  claimVictim(a, v) {
    v.claim = a;
    a.victim = v;
    this.setPath(a, v.cell, 'rescue');
  }

  /* 할 일이 없는 대원에게 일을 줍니다.
     순서: 위치가 확인된 요구조자 구조 > 미수색 구역 수색 > 대기 */
  assign(a) {
    if (a.wait > 0) { a.wait--; return; }

    if (this.waitingVictims()) {
      dijkstra(a.cell, this.site.plan[a.kind], DIST, PREV);
      const v = this.pickVictim(a, false);
      if (v) { this.claimVictim(a, v); return; }
    }

    const goal = this.pickFrontier(a);
    if (goal >= 0) {
      this.setPath(a, goal, 'explore');
      return;
    }

    if (a.kind === 'robot' && this.waitingVictims()) {
      dijkstra(a.cell, this.site.plan[a.kind], DIST, PREV);
      const v = this.pickVictim(a, true);   // 수색이 끝난 로봇은 구조를 돕습니다.
      if (v) { this.claimVictim(a, v); return; }
    }

    a.noWork = true;
    a.wait = 3;
    if (this.site.hazard[a.cell] > 0.1) this.goBase(a);
  }

  arrive(a) {
    a.budget = 0;
    if (a.task === 'rescue') {
      const v = a.victim;
      if (!v || v.dead || v.rescued) {
        this.release(a);
        a.state = 'idle';
        a.task = null;
        return;
      }
      a.state = 'rescue';
      a.timer = this.rescueTime(a, v);
      return;
    }
    if (a.task === 'base' && a.energy < a.maxEnergy * 0.5) {
      a.state = 'rest';
      a.timer = a.kind === 'human' ? this.p.hRest : this.p.rRest;
      a.task = null;
      return;
    }
    a.state = 'idle';
    a.task = null;
  }

  advance(a) {
    const cost = this.site.cost[a.kind];
    a.budget += 1;
    while (a.pathI < a.path.length) {
      const next = a.path[a.pathI];
      if (a.budget < cost[next]) break;
      a.budget -= cost[next];
      a.cell = next;
      a.pathI++;
      this.sense(a);
    }
    if (a.pathI >= a.path.length) {
      this.arrive(a);
      return;
    }
    const staleSearch = a.task === 'explore' && this.searched[a.goal];
    const staleRescue = a.task === 'rescue' && a.victim && a.victim.dead;
    if (staleSearch || staleRescue) {
      this.release(a);
      a.state = 'idle';
      a.task = null;
      a.budget = Math.min(a.budget, 1);
    }
  }

  work(a) {
    const v = a.victim;
    if (!v || v.dead) {
      this.release(a);
      a.state = 'idle';
      a.task = null;
      return;
    }
    a.timer -= 1;
    if (a.timer > 0) return;
    const chance = (a.kind === 'human' ? this.p.hSuccess : this.p.rSuccess) / 100;
    if (this.rng() < chance) {
      v.rescued = true;
      this.rescueTimes.push(this.t);
      this.release(a);
      a.state = 'idle';
      a.task = null;
    } else {
      this.failed++;
      a.timer = this.rescueTime(a, v);   // 실패하면 다시 시도합니다.
    }
  }

  act(a) {
    const p = this.p, site = this.site;
    const hz = site.hazard[a.cell];

    // 1) 현장 위험: 사람은 다치고, 로봇은 고장 납니다.
    if (a.kind === 'human') {
      if (hz > 0.05) this.exposure++;
      if (this.rng() < (p.hInjury / 100) * hz * hz) { this.knockOut(a, 'injured'); return; }
      a.energy -= hz >= 0.2 ? p.hDrain : 1;
    } else {
      const rubble = site.type[a.cell] === RUBBLE ? 2 : 1;
      if (this.rng() < (p.rFail / 100) * rubble * (1 + hz)) { this.knockOut(a, 'broken'); return; }
      a.energy -= 1;
    }

    // 2) 휴식 또는 배터리 교체
    if (a.state === 'rest') {
      a.timer -= 1;
      if (a.timer <= 0) {
        a.energy = a.maxEnergy;
        a.state = 'idle';
      }
      return;
    }

    // 3) 체력이나 배터리가 부족하면 지휘소로 돌아갑니다.
    if (a.state !== 'rescue' && a.task !== 'base' && this.needsReturn(a)) this.goBase(a);

    // 4) 일을 정하고 수행합니다.
    if (a.state === 'idle') this.assign(a);
    if (a.state === 'move') this.advance(a);
    else if (a.state === 'rescue') this.work(a);
  }

  step() {
    if (this.done) return;
    this.t++;

    // 요구조자의 생존 가능 시간이 줄어듭니다.
    for (const v of this.victims) {
      if (v.rescued || v.dead) continue;
      v.life -= 1 + this.site.hazard[v.cell] * this.p.hazardLife;
      if (v.life <= 0) v.dead = true;
    }

    for (const a of this.agents) {
      if (a.state !== 'out') this.act(a);
    }

    const active = this.agents.filter(a => a.state !== 'out');
    const resolved = this.victims.every(v => v.rescued || v.dead);
    if (resolved || active.length === 0 || this.t >= this.p.timeLimit) {
      this.done = true;
      return;
    }

    // 모두 할 일이 없으면 2회차 수색을 하고, 그래도 없으면 작업을 마칩니다.
    if (active.every(a => a.state === 'idle' && a.noWork)) {
      if (this.sweep >= 2) {
        this.done = true;
        return;
      }
      this.sweep++;
      this.searched.fill(0);
      active.forEach(a => {
        a.noWork = false;
        a.wait = 0;
        this.sense(a);   // 지금 서 있는 곳부터 다시 살핍니다.
      });
    }
  }

  result() {
    const n = this.rescueTimes.length;
    const total = this.rescueTimes.reduce((sum, t) => sum + t, 0);
    return {
      rescued: n,
      avgTime: n ? total / n : null,
      injured: this.injured,
      broken: this.broken,
      exposure: this.exposure,
      failed: this.failed,
      endTime: this.t
    };
  }
}

/* 같은 현장에 세 팀을 차례로 투입합니다. */
function runTrial(seed, cond, p) {
  const site = makeSite(seed, cond, p);
  const out = {};
  for (const team of TEAM_KEYS) {
    const sim = new Sim(site, team, p, seed);
    while (!sim.done) sim.step();
    out[team] = sim.result();
  }
  return out;
}

/* ---------- 통계 ---------- */
function summarize(values) {
  const list = values.filter(v => v !== null);
  const n = list.length;
  if (n === 0) return { n: 0, mean: null, sd: 0, ci: 0 };
  const mean = list.reduce((sum, v) => sum + v, 0) / n;
  const variance = n > 1 ? list.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  return { n, mean, sd, ci: 1.96 * sd / Math.sqrt(n) };   // ci는 95% 신뢰구간의 반폭
}

/* 같은 현장끼리 짝지어 차이를 구합니다. 차이의 평균이 신뢰구간 밖이면 뚜렷한 차이로 봅니다. */
function pairedDiff(a, b) {
  const s = summarize(a.map((v, i) => v - b[i]));
  return { mean: s.mean, ci: s.ci, clear: Math.abs(s.mean) > s.ci && s.ci > 0 };
}

const HAZARD_LEVELS = [0, 25, 50, 75, 100];
const RUBBLE_LEVELS = [0, 20, 40, 60, 80];
const SEED_START = 2026;

function trialSeed(i) { return SEED_START + i * 101; }

/* 민감도 분석에서 바꿔 볼 값 */
const SENS_OPTIONS = [
  { key: 'rRescue', label: '로봇 구조 작업 시간', unit: '분', values: [10, 15, 20, 30, 45] },
  { key: 'rSuccess', label: '로봇 구조 성공률', unit: '%', values: [30, 50, 70, 85, 100] },
  { key: 'rRubble', label: '로봇 잔해 이동 시간', unit: '분/칸', values: [1, 2, 3, 4, 6] },
  { key: 'rWork', label: '로봇 배터리 사용 시간', unit: '분', values: [45, 90, 120, 180, 240] },
  { key: 'hLimit', label: '인간 진입 한계 위험도', unit: '%', values: [40, 50, 60, 80, 100] },
  { key: 'hInjury', label: '인간 분당 부상 확률', unit: '%', values: [0.25, 0.5, 1, 2, 4] },
  { key: 'lifeMean', label: '평균 생존 가능 시간', unit: '분', values: [90, 135, 180, 240, 300] },
  { key: 'teamSize', label: '팀 인원', unit: '명', values: [2, 4, 6, 8, 10] }
];

/* =====================================================================
   2부. 화면
   ===================================================================== */

const ui = {
  params: defaultParams(),
  colors: {},
  live: null,
  exp: null,
  sens: null,
  rubblePick: 40,
  diffPair: 'robot-human',
  expToken: 0,
  sensToken: 0,
  rafId: 0,
  charts: new Set()
};

const SPEEDS = [
  { label: '느리게', tps: 4 },
  { label: '보통', tps: 12 },
  { label: '빠르게', tps: 48 }
];

function $(id) { return document.getElementById(id); }
function pause() { return new Promise(resolve => setTimeout(resolve, 0)); }
function fmt(value, digits) {
  if (value === null || value === undefined || Number.isNaN(value)) return '–';
  return value.toFixed(digits === undefined ? 1 : digits);
}
function signed(value) { return (value >= 0 ? '+' : '−') + Math.abs(value).toFixed(1); }

function readColors() {
  const style = getComputedStyle(document.documentElement);
  const read = name => style.getPropertyValue(name).trim();
  ui.colors = {
    free: read('--map-free'), rubble: read('--map-rubble'), speck: read('--map-speck'),
    wall: read('--map-wall'), fog: read('--map-fog'), hazard: read('--map-hazard'),
    edge: read('--map-edge'), ring: read('--surface'), ink: read('--ink'),
    human: read('--team-human'), robot: read('--team-robot'), hybrid: read('--team-hybrid'),
    hidden: read('--victim-hidden'), found: read('--victim-found'),
    saved: read('--victim-saved'), lost: read('--victim-lost')
  };
}

/* ---------- 1단계: 현장 관찰 ---------- */

function readCondition() {
  return { hazard: Number($('hazard').value), rubble: Number($('rubble').value) };
}

function newLive() {
  const seed = Math.max(1, Math.floor(Number($('siteSeed').value) || 1));
  const cond = readCondition();
  const site = makeSite(seed, cond, ui.params);
  const views = {};
  TEAM_KEYS.forEach(team => {
    const canvas = $('map-' + team);
    views[team] = { team, canvas, ctx: canvas.getContext('2d'), sim: new Sim(site, team, ui.params, seed), curve: [0] };
  });
  const wasPlaying = ui.live ? ui.live.playing : !prefersStill();
  ui.live = { site, seed, views, playing: false, speed: ui.live ? ui.live.speed : 1, acc: 0, last: 0, layer: null, finished: false };
  updateCompositions();
  sizeMaps();
  renderLive(true);
  if (wasPlaying) play();
  else if (prefersStill()) {
    for (let i = 0; i < 60; i++) stepLive();
    renderLive(true);
  }
  updatePlayButton();
}

function prefersStill() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function updateCompositions() {
  TEAM_KEYS.forEach(team => {
    const members = teamMembers(team, ui.params.teamSize);
    const humans = members.filter(k => k === 'human').length;
    const robots = members.length - humans;
    const parts = [];
    if (humans) parts.push('사람 ' + humans + '명');
    if (robots) parts.push('로봇 ' + robots + '대');
    $('comp-' + team).textContent = parts.join(' · ');
  });
}

function stepLive() {
  const live = ui.live;
  let running = false;
  TEAM_KEYS.forEach(team => {
    const view = live.views[team];
    if (!view.sim.done) {
      view.sim.step();
      running = true;
    }
    view.curve[liveClock()] = view.sim.rescueTimes.length;
  });
  if (!running) live.finished = true;
  return running;
}

function liveClock() {
  return Math.max(...TEAM_KEYS.map(team => ui.live.views[team].sim.t));
}

function play() {
  if (ui.live.finished) {
    ui.live.playing = false;
    newLive();
  }
  const live = ui.live;
  live.playing = true;
  live.last = performance.now();
  cancelAnimationFrame(ui.rafId);
  ui.rafId = requestAnimationFrame(frame);
  updatePlayButton();
}

function stopPlay() {
  ui.live.playing = false;
  cancelAnimationFrame(ui.rafId);
  updatePlayButton();
}

function frame(now) {
  const live = ui.live;
  if (!live.playing) return;
  const dt = Math.min(0.1, (now - live.last) / 1000);
  live.last = now;
  live.acc += dt * SPEEDS[live.speed].tps;
  let changed = false;
  while (live.acc >= 1 && !live.finished) {
    live.acc -= 1;
    stepLive();
    changed = true;
  }
  if (changed) renderLive(false);
  if (live.finished) {
    live.playing = false;
    renderLive(true);
    updatePlayButton();
    return;
  }
  ui.rafId = requestAnimationFrame(frame);
}

function updatePlayButton() {
  const live = ui.live;
  const button = $('playToggle');
  button.textContent = live.playing ? '일시정지' : live.finished ? '다시 재생' : '재생';
  button.setAttribute('aria-pressed', live.playing ? 'true' : 'false');
  document.querySelectorAll('[data-speed]').forEach(el => {
    el.setAttribute('aria-pressed', Number(el.dataset.speed) === live.speed ? 'true' : 'false');
  });
}

function sizeMaps() {
  if (!ui.live) return;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  TEAM_KEYS.forEach(team => {
    const view = ui.live.views[team];
    const width = view.canvas.clientWidth || 360;
    const px = Math.round(width * ratio);
    const py = Math.round(px * H / W);
    if (view.canvas.width !== px || view.canvas.height !== py) {
      view.canvas.width = px;
      view.canvas.height = py;
      ui.live.layer = null;
    }
  });
}

/* 지형과 위험 구역은 바뀌지 않으므로 한 장으로 미리 그려 둡니다. */
function buildLayer() {
  const live = ui.live;
  const first = live.views.human.canvas;
  const layer = document.createElement('canvas');
  layer.width = first.width;
  layer.height = first.height;
  const ctx = layer.getContext('2d');
  const c = ui.colors;
  const site = live.site;
  const cw = layer.width / W, ch = layer.height / H;
  const rng = makeRng(site.seed);

  ctx.fillStyle = c.free;
  ctx.fillRect(0, 0, layer.width, layer.height);

  for (let i = 0; i < N; i++) {
    const x = (i % W) * cw, y = Math.floor(i / W) * ch;
    const px = Math.floor(x), py = Math.floor(y), pw = Math.ceil(cw), ph = Math.ceil(ch);
    if (site.type[i] === WALL) {
      ctx.fillStyle = c.wall;
      ctx.fillRect(px, py, pw, ph);
    } else if (site.type[i] === RUBBLE) {
      ctx.fillStyle = c.rubble;
      ctx.fillRect(px, py, pw, ph);
      ctx.fillStyle = c.speck;
      for (let k = 0; k < 3; k++) {
        const size = Math.max(1, cw * 0.14);
        ctx.fillRect(x + rng() * (cw - size), y + rng() * (ch - size), size, size);
      }
    }
    if (site.hazard[i] > 0.03 && site.type[i] !== WALL) {
      ctx.globalAlpha = Math.min(0.62, site.hazard[i] * 0.62);
      ctx.fillStyle = c.hazard;
      ctx.fillRect(px, py, pw, ph);
      ctx.globalAlpha = 1;
    }
  }

  // 사람이 들어갈 수 없는 구역의 경계선
  ctx.strokeStyle = c.edge;
  ctx.lineWidth = Math.max(1.5, cw * 0.14);
  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    if (!site.noGo[i]) continue;
    const x = (i % W) * cw, y = Math.floor(i / W) * ch;
    const outside = k => { const n = ADJ[i * 4 + k]; return n >= 0 && !site.noGo[n] && site.type[n] !== WALL; };
    if (outside(0)) { ctx.moveTo(x, y); ctx.lineTo(x, y + ch); }
    if (outside(1)) { ctx.moveTo(x + cw, y); ctx.lineTo(x + cw, y + ch); }
    if (outside(2)) { ctx.moveTo(x, y); ctx.lineTo(x + cw, y); }
    if (outside(3)) { ctx.moveTo(x, y + ch); ctx.lineTo(x + cw, y + ch); }
  }
  ctx.stroke();

  // 지휘소
  const bx = (site.base % W + 0.5) * cw, by = (Math.floor(site.base / W) + 0.5) * ch;
  ctx.fillStyle = c.ink;
  ctx.beginPath();
  ctx.moveTo(bx, by - ch * 0.8);
  ctx.lineTo(bx + cw * 0.8, by + ch * 0.45);
  ctx.lineTo(bx - cw * 0.8, by + ch * 0.45);
  ctx.closePath();
  ctx.fill();

  // 축척: 5칸 = 25 m
  const sx = cw * 0.8, sy = layer.height - ch * 0.8;
  ctx.strokeStyle = c.ink;
  ctx.lineWidth = Math.max(1, cw * 0.1);
  ctx.beginPath();
  ctx.moveTo(sx, sy - ch * 0.25);
  ctx.lineTo(sx, sy);
  ctx.lineTo(sx + cw * 5, sy);
  ctx.lineTo(sx + cw * 5, sy - ch * 0.25);
  ctx.stroke();
  ctx.fillStyle = c.ink;
  ctx.font = '600 ' + Math.round(ch * 0.8) + 'px "IBM Plex Mono", monospace';
  ctx.fillText('25 m', sx + cw * 5.5, sy);

  live.layer = layer;
}

function drawMap(view) {
  const { ctx, canvas, sim } = view;
  const c = ui.colors;
  const cw = canvas.width / W, ch = canvas.height / H;
  const center = cell => [(cell % W + 0.5) * cw, (Math.floor(cell / W) + 0.5) * ch];

  ctx.drawImage(ui.live.layer, 0, 0);

  // 아직 수색하지 않은 칸은 흐리게 가립니다.
  ctx.fillStyle = c.fog;
  for (let i = 0; i < N; i++) {
    if (!sim.searched[i] && sim.site.type[i] !== WALL) {
      ctx.fillRect(Math.floor((i % W) * cw), Math.floor(Math.floor(i / W) * ch), Math.ceil(cw), Math.ceil(ch));
    }
  }

  const unit = Math.min(cw, ch);

  // 구조하러 가는 경로
  ctx.lineWidth = Math.max(1, unit * 0.1);
  ctx.strokeStyle = c[view.team];
  sim.agents.forEach(a => {
    if (a.task !== 'rescue' || a.state !== 'move') return;
    ctx.beginPath();
    const [sx, sy] = center(a.cell);
    ctx.moveTo(sx, sy);
    for (let i = a.pathI; i < a.path.length; i++) {
      const [x, y] = center(a.path[i]);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  });

  // 요구조자
  sim.victims.forEach(v => {
    const [x, y] = center(v.cell);
    if (v.rescued) {
      ctx.strokeStyle = c.ring;
      ctx.lineWidth = unit * 0.5;
      drawPlus(ctx, x, y, unit * 0.42);
      ctx.strokeStyle = c.saved;
      ctx.lineWidth = unit * 0.26;
      drawPlus(ctx, x, y, unit * 0.42);
    } else if (v.dead) {
      ctx.strokeStyle = c.lost;
      ctx.lineWidth = unit * 0.16;
      drawCross(ctx, x, y, unit * 0.32);
    } else if (v.found) {
      ctx.beginPath();
      ctx.arc(x, y, unit * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = c.found;
      ctx.fill();
      ctx.lineWidth = unit * 0.13;
      ctx.strokeStyle = c.ink;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, unit * 0.26, 0, Math.PI * 2);
      ctx.lineWidth = unit * 0.13;
      ctx.strokeStyle = c.hidden;
      ctx.stroke();
    }
  });

  // 대원: 사람은 원, 로봇은 네모
  sim.agents.forEach(a => {
    const [x, y] = center(a.cell);
    const size = unit * 0.62;
    if (a.state === 'out') {
      ctx.strokeStyle = c[view.team];
      ctx.lineWidth = unit * 0.2;
      drawCross(ctx, x, y, unit * 0.42);
      return;
    }
    ctx.lineWidth = unit * 0.22;
    ctx.strokeStyle = c.ring;
    ctx.fillStyle = a.state === 'rest' ? c.ring : c[view.team];
    ctx.beginPath();
    if (a.kind === 'human') ctx.arc(x, y, size, 0, Math.PI * 2);
    else ctx.rect(x - size, y - size, size * 2, size * 2);
    ctx.stroke();
    ctx.fill();
    if (a.state === 'rest') {
      ctx.strokeStyle = c[view.team];
      ctx.lineWidth = unit * 0.16;
      ctx.stroke();
    }
    if (a.state === 'rescue') {
      ctx.strokeStyle = c.ink;
      ctx.lineWidth = unit * 0.14;
      ctx.beginPath();
      ctx.arc(x, y, size * 1.65, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

function drawPlus(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.lineTo(x + r, y);
  ctx.moveTo(x, y - r);
  ctx.lineTo(x, y + r);
  ctx.stroke();
}

function drawCross(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x - r, y - r);
  ctx.lineTo(x + r, y + r);
  ctx.moveTo(x + r, y - r);
  ctx.lineTo(x - r, y + r);
  ctx.stroke();
}

function renderLive(forceChart) {
  const live = ui.live;
  if (!live.layer) buildLayer();
  TEAM_KEYS.forEach(team => {
    const view = live.views[team];
    const sim = view.sim;
    drawMap(view);
    const r = sim.result();
    const out = r.injured + r.broken;
    $('st-' + team + '-saved').textContent = r.rescued;
    $('st-' + team + '-left').textContent = sim.victims.length - r.rescued;
    $('st-' + team + '-hurt').textContent = team === 'robot' ? '–' : r.injured;
    $('st-' + team + '-broken').textContent = team === 'human' ? '–' : r.broken;
    view.canvas.setAttribute('aria-label',
      TEAM_NAMES[team] + ' 현장 지도. ' + sim.t + '분 경과, ' + r.rescued + '명 구조, 대원 이탈 ' + out + '명.');
    const state = $('state-' + team);
    state.textContent = sim.done ? '작업 종료 ' + sim.t + '분' : '작업 중';
    state.dataset.done = sim.done ? 'true' : 'false';
  });
  const clock = liveClock();
  $('clock').textContent = 'T+' + String(clock).padStart(3, '0') + '분';
  $('clockLimit').textContent = '제한 ' + ui.params.timeLimit + '분';
  const slot = Math.floor(clock / 10);
  if (forceChart || slot !== live.chartSlot) {
    live.chartSlot = slot;
    renderLiveChart();
  }
}

function renderLiveChart() {
  const live = ui.live;
  const clock = liveClock();
  const step = 10;
  const xs = [];
  for (let t = 0; t <= ui.params.timeLimit; t += step) xs.push(t);
  const series = TEAM_KEYS.map(team => {
    const curve = live.views[team].curve;
    const values = xs.map(t => (t > clock || curve[t] === undefined ? null : curve[t]));
    return { key: team, name: TEAM_NAMES[team], values };
  });
  drawLineChart($('liveChart'), {
    xs, series, yMax: ui.params.victims, xLabel: '경과 시간(분)', yLabel: '누적 구조 인원(명)',
    xTicks: niceTimeTicks(ui.params.timeLimit), dots: false, unit: '명', xUnit: '분',
    digits: 0, height: 250, ariaLabel: '세 팀의 누적 구조 인원 변화'
  });
}

function niceTimeTicks(limit) {
  const step = limit > 300 ? 60 : limit > 120 ? 30 : 15;
  const ticks = [];
  for (let t = 0; t <= limit; t += step) ticks.push(t);
  return ticks;
}

/* ---------- 차트 ----------
   외부 라이브러리 없이 SVG로 직접 그립니다. */
const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.keys(attrs || {}).forEach(key => node.setAttribute(key, attrs[key]));
  if (parent) parent.appendChild(node);
  return node;
}

function niceStep(max) {
  const rough = max / 4;
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const scaled = rough / power;
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10) * power;
}

function drawLineChart(box, opt) {
  box._opt = opt;
  ui.charts.add(box);
  box.textContent = '';

  const legend = document.createElement('div');
  legend.className = 'legend';
  opt.series.forEach(s => {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const key = document.createElement('i');
    key.className = 'line-key k-' + s.key;
    item.append(key, document.createTextNode(s.name));
    legend.appendChild(item);
  });
  box.appendChild(legend);

  const width = Math.max(280, box.clientWidth);
  const height = opt.height || 300;
  const m = { l: 44, r: 16, t: 10, b: 44 };
  const xs = opt.xs;
  const xMin = xs[0], xMax = xs[xs.length - 1];

  // 오른쪽 끝 값 위치를 먼저 계산해, 겹치지 않을 때만 팀 이름을 직접 씁니다.
  const ends = opt.series.map(s => {
    let i = s.values.length - 1;
    while (i >= 0 && s.values[i] === null) i--;
    return { s, i, v: i >= 0 ? s.values[i] : null };
  }).filter(e => e.v !== null);
  const previewH = height - m.t - m.b;
  const sorted = ends.slice().sort((a, b) => a.v - b.v);
  let roomy = opt.endLabels && width > 520;
  for (let i = 1; i < sorted.length; i++) {
    if ((sorted[i].v - sorted[i - 1].v) / opt.yMax * previewH < 15) roomy = false;
  }
  if (roomy) m.r = 66;

  const pw = width - m.l - m.r, ph = height - m.t - m.b;
  const X = v => m.l + (xMax === xMin ? 0 : (v - xMin) / (xMax - xMin)) * pw;
  const Y = v => m.t + ph - (v / opt.yMax) * ph;

  const root = svg('svg', { viewBox: '0 0 ' + width + ' ' + height, width: '100%', height, role: 'img', 'aria-label': opt.ariaLabel || '' }, box);
  root.style.display = 'block';

  const yStep = niceStep(opt.yMax);
  for (let v = 0; v <= opt.yMax + 1e-9; v += yStep) {
    svg('line', { x1: m.l, x2: m.l + pw, y1: Y(v), y2: Y(v), class: v === 0 ? 'c-base' : 'c-grid' }, root);
    const label = svg('text', { x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end', class: 'c-tick' }, root);
    label.textContent = Number(v.toFixed(2));
  }
  (opt.xTicks || xs).forEach((v, i, all) => {
    const anchor = i === 0 && xMin === v && all.length > 6 ? 'start' : i === all.length - 1 && all.length > 6 ? 'end' : 'middle';
    const label = svg('text', { x: X(v), y: m.t + ph + 18, 'text-anchor': anchor, class: 'c-tick' }, root);
    label.textContent = v;
  });
  const xTitle = svg('text', { x: m.l + pw / 2, y: height - 6, 'text-anchor': 'middle', class: 'c-title' }, root);
  xTitle.textContent = opt.xLabel;
  const yTitle = svg('text', { x: 0, y: 0, 'text-anchor': 'middle', class: 'c-title', transform: 'translate(11,' + (m.t + ph / 2) + ') rotate(-90)' }, root);
  yTitle.textContent = opt.yLabel;

  opt.series.forEach(s => {
    const points = s.values.map((v, i) => (v === null ? null : [X(xs[i]), Y(v)]));
    if (s.lo) {
      let up = '', down = '';
      s.values.forEach((v, i) => {
        if (v === null) return;
        up += (up ? 'L' : 'M') + X(xs[i]) + ' ' + Y(Math.min(opt.yMax, s.hi[i]));
        down = 'L' + X(xs[i]) + ' ' + Y(Math.max(0, s.lo[i])) + down;
      });
      svg('path', { d: up + down + 'Z', class: 'c-band f-' + s.key }, root);
    }
    let d = '';
    points.forEach(pt => { if (pt) d += (d ? 'L' : 'M') + pt[0] + ' ' + pt[1]; });
    svg('path', { d, class: 'c-line s-' + s.key }, root);
    if (opt.dots) {
      points.forEach(pt => { if (pt) svg('circle', { cx: pt[0], cy: pt[1], r: 4, class: 'c-dot f-' + s.key }, root); });
    }
  });

  if (roomy) {
    ends.forEach(e => {
      const x = X(xs[e.i]) + 8;
      const label = svg('text', { x, y: Y(e.v) + 4, class: 'c-end' }, root);
      label.textContent = TEAM_SHORT[e.s.key] + ' ' + fmt(e.v, opt.digits);
    });
  }

  // 마우스나 키보드로 가까운 x값의 수치를 봅니다.
  const cross = svg('line', { x1: 0, x2: 0, y1: m.t, y2: m.t + ph, class: 'c-cross', visibility: 'hidden' }, root);
  xs.forEach((v, i) => {
    const hasData = opt.series.some(s => s.values[i] !== null);
    if (!hasData) return;
    const left = i === 0 ? m.l : (X(xs[i - 1]) + X(v)) / 2;
    const right = i === xs.length - 1 ? m.l + pw : (X(v) + X(xs[i + 1])) / 2;
    const hit = svg('rect', { x: left, y: m.t, width: Math.max(1, right - left), height: ph, class: 'c-hit' }, root);
    if (opt.dots) {
      hit.setAttribute('tabindex', '0');
      hit.setAttribute('aria-label', opt.xLabel + ' ' + v + ': ' + opt.series.map(s => s.name + ' ' + fmt(s.values[i], opt.digits)).join(', '));
    }
    const show = () => {
      cross.setAttribute('x1', X(v));
      cross.setAttribute('x2', X(v));
      cross.setAttribute('visibility', 'visible');
      const rows = opt.series
        .filter(s => s.values[i] !== null)
        .map(s => ({ key: s.key, name: s.name, value: fmt(s.values[i], opt.digits) + (opt.unit || '') }));
      const rect = hit.getBoundingClientRect();
      showTip(rect.left + rect.width / 2, rect.top + 12, opt.xLabel.replace(/\(.*\)/, '').trim() + ' ' + v + (opt.xUnit || ''), rows);
    };
    const hide = () => { cross.setAttribute('visibility', 'hidden'); hideTip(); };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('pointerleave', hide);
    hit.addEventListener('focus', show);
    hit.addEventListener('blur', hide);
  });
}

function showTip(x, y, title, rows) {
  const tip = $('tip');
  tip.textContent = '';
  const head = document.createElement('div');
  head.className = 'tip-title';
  head.textContent = title;
  tip.appendChild(head);
  rows.forEach(row => {
    const line = document.createElement('div');
    line.className = 'tip-row';
    if (row.key) {
      const key = document.createElement('i');
      key.className = 'line-key k-' + row.key;
      line.appendChild(key);
    }
    const value = document.createElement('strong');
    value.textContent = row.value;
    const name = document.createElement('span');
    name.textContent = row.name;
    line.append(value, name);
    tip.appendChild(line);
  });
  tip.hidden = false;
  const box = tip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - box.width - 8, Math.max(8, x + 14));
  const top = Math.min(window.innerHeight - box.height - 8, Math.max(8, y));
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
}

function hideTip() { $('tip').hidden = true; }

/* 격자형 결과표(히트맵). 값이 칸 안에 그대로 적혀 있어 색 없이도 읽을 수 있습니다. */
function drawHeat(box, hazards, rubbles, cellFor) {
  box.textContent = '';
  const grid = document.createElement('div');
  grid.className = 'heat';
  grid.style.gridTemplateColumns = '3.4rem repeat(' + hazards.length + ', minmax(0, 1fr))';

  rubbles.slice().reverse().forEach(rubble => {
    const row = document.createElement('div');
    row.className = 'heat-label' + (rubble === ui.rubblePick ? ' is-picked' : '');
    row.textContent = '잔해 ' + rubble + '%';
    grid.appendChild(row);
    hazards.forEach(hazard => {
      const info = cellFor(rubble, hazard);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.dataset.cell = rubble + '-' + hazard;
      cell.className = 'heat-cell' + (rubble === ui.rubblePick ? ' is-picked' : '') + (info.muted ? ' is-muted' : '');
      cell.style.background = info.bg;
      cell.setAttribute('aria-label', '잔해 ' + rubble + '%, 위험도 ' + hazard + '%. ' + info.spoken + '. 아래 그래프를 이 잔해 조건으로 바꿉니다.');
      const main = document.createElement('strong');
      main.textContent = info.main;
      cell.appendChild(main);
      const sub = document.createElement('span');
      sub.textContent = info.sub;
      cell.appendChild(sub);
      const show = () => {
        const rect = cell.getBoundingClientRect();
        showTip(rect.right, rect.top, '잔해 ' + rubble + '% · 위험도 ' + hazard + '%', info.rows);
      };
      cell.addEventListener('pointerenter', show);
      cell.addEventListener('pointerleave', hideTip);
      cell.addEventListener('focus', show);
      cell.addEventListener('blur', hideTip);
      cell.addEventListener('click', () => {
        ui.rubblePick = rubble;
        $('lineRubble').value = String(rubble);
        hideTip();
        renderExperiment();
        const again = box.querySelector('[data-cell="' + rubble + '-' + hazard + '"]');
        if (again) again.focus({ preventScroll: true });
      });
      grid.appendChild(cell);
    });
  });

  grid.appendChild(document.createElement('div'));
  hazards.forEach(hazard => {
    const label = document.createElement('div');
    label.className = 'heat-axis';
    label.textContent = hazard + '%';
    grid.appendChild(label);
  });
  box.appendChild(grid);

  const axis = document.createElement('p');
  axis.className = 'heat-caption';
  axis.textContent = '가로축은 현장 위험도예요. 칸을 누르면 아래 그래프의 잔해 조건이 바뀌어요.';
  box.appendChild(axis);
}

/* ---------- 2단계: 조건 실험 ---------- */

function emptyStats() {
  const stats = {};
  TEAM_KEYS.forEach(team => {
    stats[team] = { rescued: [], avgTime: [], injured: [], broken: [], exposure: [] };
  });
  return stats;
}

function record(stats, trial) {
  TEAM_KEYS.forEach(team => {
    Object.keys(stats[team]).forEach(key => stats[team][key].push(trial[team][key]));
  });
}

function setBusy(prefix, busy, ratio) {
  $(prefix + 'Bar').hidden = !busy;
  $(prefix + 'Fill').style.width = Math.round((ratio || 0) * 100) + '%';
  $(prefix + 'Output').classList.toggle('is-busy', busy);
}

async function runExperiment() {
  const token = ++ui.expToken;
  const repeats = Number($('repeat').value);
  const p = Object.assign({}, ui.params);
  const total = HAZARD_LEVELS.length * RUBBLE_LEVELS.length * repeats;
  const cells = {};
  let count = 0;
  let mark = performance.now();
  setBusy('exp', true, 0);
  $('expStale').hidden = true;
  for (const rubble of RUBBLE_LEVELS) {
    for (const hazard of HAZARD_LEVELS) {
      const stats = emptyStats();
      for (let i = 0; i < repeats; i++) {
        record(stats, runTrial(trialSeed(i), { hazard, rubble }, p));
        count++;
        if (performance.now() - mark > 12) {
          $('expFill').style.width = Math.round(count / total * 100) + '%';
          await pause();
          if (token !== ui.expToken) return;
          mark = performance.now();
        }
      }
      cells[rubble + '-' + hazard] = stats;
    }
  }
  ui.exp = { cells, repeats, victims: p.victims };
  setBusy('exp', false);
  renderExperiment();
}

function teamRow(stats, team) {
  const rescued = summarize(stats[team].rescued);
  return {
    rescued,
    avgTime: summarize(stats[team].avgTime),
    injured: summarize(stats[team].injured),
    broken: summarize(stats[team].broken),
    exposure: summarize(stats[team].exposure)
  };
}

function bestTeam(stats) {
  const means = TEAM_KEYS.map(team => ({ team, mean: summarize(stats[team].rescued).mean }));
  means.sort((a, b) => b.mean - a.mean);
  const diff = pairedDiff(stats[means[0].team].rescued, stats[means[1].team].rescued);
  return { team: means[0].team, mean: means[0].mean, runnerUp: means[1].team, clear: diff.clear };
}

function resultRows(stats) {
  return TEAM_KEYS.map(team => ({
    key: team,
    name: TEAM_NAMES[team],
    value: fmt(summarize(stats[team].rescued).mean) + '명'
  }));
}

function renderExperiment() {
  const exp = ui.exp;
  if (!exp) return;
  const cellOf = (rubble, hazard) => exp.cells[rubble + '-' + hazard];

  // 가장 많이 구조한 팀
  drawHeat($('heatBest'), HAZARD_LEVELS, RUBBLE_LEVELS, (rubble, hazard) => {
    const stats = cellOf(rubble, hazard);
    const best = bestTeam(stats);
    const tint = best.clear ? 'color-mix(in srgb, var(--team-' + best.team + ') 34%, var(--heat-mid))' : 'var(--heat-mid)';
    return {
      main: best.clear ? TEAM_SHORT[best.team] : '비슷',
      sub: fmt(best.mean) + '명',
      bg: tint,
      muted: !best.clear,
      spoken: best.clear ? TEAM_NAMES[best.team] + '이 평균 ' + fmt(best.mean) + '명으로 가장 많이 구조' : TEAM_SHORT[best.team] + '과 ' + TEAM_SHORT[best.runnerUp] + ' 팀의 차이가 뚜렷하지 않음',
      rows: resultRows(stats)
    };
  });

  // 두 팀의 차이
  const [teamA, teamB] = ui.diffPair.split('-');
  const allDiffs = [];
  RUBBLE_LEVELS.forEach(r => HAZARD_LEVELS.forEach(h => {
    allDiffs.push(Math.abs(pairedDiff(cellOf(r, h)[teamA].rescued, cellOf(r, h)[teamB].rescued).mean));
  }));
  const maxDiff = Math.max(1, ...allDiffs);
  drawHeat($('heatDiff'), HAZARD_LEVELS, RUBBLE_LEVELS, (rubble, hazard) => {
    const stats = cellOf(rubble, hazard);
    const diff = pairedDiff(stats[teamA].rescued, stats[teamB].rescued);
    const lead = diff.mean >= 0 ? teamA : teamB;
    const strength = Math.round(Math.min(1, Math.abs(diff.mean) / maxDiff) * 56);
    return {
      main: signed(diff.mean),
      sub: diff.clear ? TEAM_SHORT[lead] + ' 우세' : '차이 작음',
      bg: diff.clear ? 'color-mix(in srgb, var(--team-' + lead + ') ' + Math.max(12, strength) + '%, var(--heat-mid))' : 'var(--heat-mid)',
      muted: !diff.clear,
      spoken: TEAM_NAMES[teamA] + '에서 ' + TEAM_NAMES[teamB] + '을 뺀 값이 ' + signed(diff.mean) + '명' + (diff.clear ? '' : ', 차이가 뚜렷하지 않음'),
      rows: resultRows(stats).concat([{ name: '차이 ±' + fmt(diff.ci) + ' (95%)', value: signed(diff.mean) + '명' }])
    };
  });
  $('diffCaption').textContent = TEAM_NAMES[teamA] + ' − ' + TEAM_NAMES[teamB] + ' 구조 인원 차이(명)';

  // 위험도에 따른 구조 인원
  const rubble = ui.rubblePick;
  const series = TEAM_KEYS.map(team => {
    const rows = HAZARD_LEVELS.map(h => summarize(cellOf(rubble, h)[team].rescued));
    return {
      key: team,
      name: TEAM_NAMES[team],
      values: rows.map(r => r.mean),
      lo: rows.map(r => r.mean - r.ci),
      hi: rows.map(r => r.mean + r.ci)
    };
  });
  drawLineChart($('hazardChart'), {
    xs: HAZARD_LEVELS, series, yMax: exp.victims, xLabel: '현장 위험도(%)', yLabel: '평균 구조 인원(명)',
    dots: true, unit: '명', xUnit: '%', digits: 1, endLabels: true, height: 320,
    ariaLabel: '잔해 ' + rubble + '%에서 위험도에 따른 세 팀의 평균 구조 인원'
  });
  $('hazardChartTitle').textContent = '잔해 ' + rubble + '%에서 위험도가 오를 때 구조 인원';

  // 위험도에 따른 인간 대원 부상
  const hurt = ['human', 'hybrid'].map(team => {
    const rows = HAZARD_LEVELS.map(h => summarize(cellOf(rubble, h)[team].injured));
    return { key: team, name: TEAM_NAMES[team], values: rows.map(r => r.mean) };
  });
  drawLineChart($('hurtChart'), {
    xs: HAZARD_LEVELS, series: hurt,
    yMax: Math.max(1, Math.ceil(Math.max(...hurt.flatMap(s => s.values)) * 2) / 2),
    xLabel: '현장 위험도(%)', yLabel: '부상자(명)', dots: true, unit: '명', xUnit: '%', digits: 2,
    endLabels: false, height: 320, ariaLabel: '잔해 ' + rubble + '%에서 위험도에 따른 사람 대원 부상자 수'
  });

  renderSummary();
  renderTable();
}

function renderSummary() {
  const exp = ui.exp;
  const cellOf = (r, h) => exp.cells[r + '-' + h];
  let robotAhead = 0, humanAhead = 0, hybridBest = 0;
  let closest = null, widest = null;
  let humanHurt = 0, hybridHurt = 0;
  const firstCross = {};
  RUBBLE_LEVELS.forEach(r => {
    HAZARD_LEVELS.forEach(h => {
      const stats = cellOf(r, h);
      const diff = pairedDiff(stats.robot.rescued, stats.human.rescued);
      if (diff.clear && diff.mean > 0) {
        robotAhead++;
        if (firstCross[r] === undefined) firstCross[r] = h;
      }
      if (diff.clear && diff.mean < 0) humanAhead++;
      if (!closest || diff.mean > closest.mean) closest = { r, h, mean: diff.mean };
      if (!widest || diff.mean < widest.mean) widest = { r, h, mean: diff.mean };
      const best = bestTeam(stats);
      if (best.team === 'hybrid' && best.clear) hybridBest++;
      humanHurt += summarize(stats.human.injured).mean;
      hybridHurt += summarize(stats.hybrid.injured).mean;
    });
  });
  const total = RUBBLE_LEVELS.length * HAZARD_LEVELS.length;
  const crossText = RUBBLE_LEVELS.filter(r => firstCross[r] !== undefined)
    .map(r => '잔해 ' + r + '%에서는 위험도 ' + firstCross[r] + '%')
    .join(', ');

  $('sumRobot').textContent = robotAhead + '/' + total;
  $('sumHuman').textContent = humanAhead + '/' + total;
  $('sumHybrid').textContent = hybridBest + '/' + total;
  $('sumText').textContent = robotAhead
    ? crossText + '부터 로봇 팀이 인간 팀보다 뚜렷하게 많이 구조했어요.'
    : '현재 가정값에서는 로봇 팀이 인간 팀을 뚜렷하게 앞선 조건이 없었어요.';

  const gapText = '인간 팀과 로봇 팀의 격차는 잔해 ' + widest.r + '%, 위험도 ' + widest.h + '%에서 ' + Math.abs(widest.mean).toFixed(1) +
    '명으로 가장 컸고, 잔해 ' + closest.r + '%, 위험도 ' + closest.h + '%에서 ' + signed(closest.mean) + '명으로 로봇 팀에 가장 유리했어요.';
  const hurtText = humanHurt > 0
    ? ' 협업 팀의 사람 부상자는 인간 팀보다 ' + Math.round((1 - hybridHurt / humanHurt) * 100) + '% 적었어요. 투입한 사람 수가 절반인 점을 함께 봐야 해요.'
    : '';
  const nextText = robotAhead ? '' : ' 3단계에서 어떤 가정이 바뀌면 순위가 뒤집히는지 확인해 보세요.';
  $('sumExtra').textContent = gapText + hurtText + nextText;
  $('expMeta').textContent = '조건 ' + total + '개 × 반복 ' + exp.repeats + '회. 조건마다 같은 현장 ' + exp.repeats + '곳에 세 팀을 투입했어요.';
}

const TABLE_COLUMNS = [
  { label: '잔해(%)', get: (r) => r.rubble },
  { label: '위험도(%)', get: (r) => r.hazard },
  { label: '구조 인간', get: (r) => fmt(r.human.rescued.mean) },
  { label: '구조 로봇', get: (r) => fmt(r.robot.rescued.mean) },
  { label: '구조 협업', get: (r) => fmt(r.hybrid.rescued.mean) },
  { label: '구조 시각 인간(분)', get: (r) => fmt(r.human.avgTime.mean, 0) },
  { label: '구조 시각 로봇(분)', get: (r) => fmt(r.robot.avgTime.mean, 0) },
  { label: '구조 시각 협업(분)', get: (r) => fmt(r.hybrid.avgTime.mean, 0) },
  { label: '부상 인간', get: (r) => fmt(r.human.injured.mean, 2) },
  { label: '부상 협업', get: (r) => fmt(r.hybrid.injured.mean, 2) },
  { label: '고장 로봇', get: (r) => fmt(r.robot.broken.mean, 2) },
  { label: '고장 협업', get: (r) => fmt(r.hybrid.broken.mean, 2) }
];

function tableRows() {
  const rows = [];
  RUBBLE_LEVELS.forEach(rubble => HAZARD_LEVELS.forEach(hazard => {
    const stats = ui.exp.cells[rubble + '-' + hazard];
    const row = { rubble, hazard };
    TEAM_KEYS.forEach(team => { row[team] = teamRow(stats, team); });
    rows.push(row);
  }));
  return rows;
}

function renderTable() {
  const head = $('resultHead');
  const body = $('resultBody');
  head.textContent = '';
  body.textContent = '';
  const top = document.createElement('tr');
  TABLE_COLUMNS.forEach(col => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = col.label;
    top.appendChild(th);
  });
  head.appendChild(top);
  tableRows().forEach(row => {
    const tr = document.createElement('tr');
    TABLE_COLUMNS.forEach(col => {
      const td = document.createElement('td');
      td.textContent = col.get(row);
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

function copyText(text, statusId, button) {
  const done = message => {
    $(statusId).textContent = message;
    setTimeout(() => { $(statusId).textContent = ''; }, 4000);
  };
  const fallback = () => {
    const area = document.createElement('textarea');
    area.value = text;
    button.after(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    area.remove();
    done(ok ? '복사했어요. 엑셀에 붙여 넣으세요.' : '복사가 막혀 있어요. 아래 표를 드래그해서 복사하세요.');
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => done('복사했어요. 엑셀에 붙여 넣으세요.'))
      .catch(fallback);
  } else {
    fallback();
  }
}

function tableText() {
  const lines = [TABLE_COLUMNS.map(col => col.label).join('\t')];
  tableRows().forEach(row => lines.push(TABLE_COLUMNS.map(col => col.get(row)).join('\t')));
  return lines.join('\n');
}

/* ---------- 3단계: 민감도 분석 ---------- */

async function runSensitivity() {
  const token = ++ui.sensToken;
  const option = SENS_OPTIONS.find(item => item.key === $('sensParam').value);
  const hazard = Number($('sensHazard').value);
  const rubble = Number($('sensRubble').value);
  const repeats = Number($('repeat').value);
  const base = Object.assign({}, ui.params);
  const total = option.values.length * repeats;
  const results = [];
  let count = 0;
  let mark = performance.now();
  setBusy('sens', true, 0);
  $('sensStale').hidden = true;
  for (const value of option.values) {
    const p = Object.assign({}, base, { [option.key]: value });
    const stats = emptyStats();
    for (let i = 0; i < repeats; i++) {
      record(stats, runTrial(trialSeed(i), { hazard, rubble }, p));
      count++;
      if (performance.now() - mark > 12) {
        $('sensFill').style.width = Math.round(count / total * 100) + '%';
        await pause();
        if (token !== ui.sensToken) return;
        mark = performance.now();
      }
    }
    results.push({ value, stats });
  }
  ui.sens = { option, hazard, rubble, repeats, results, victims: base.victims };
  setBusy('sens', false);
  renderSensitivity();
}

function renderSensitivity() {
  const sens = ui.sens;
  if (!sens) return;
  const xs = sens.option.values;
  const series = TEAM_KEYS.map(team => {
    const rows = sens.results.map(r => summarize(r.stats[team].rescued));
    return {
      key: team,
      name: TEAM_NAMES[team],
      values: rows.map(r => r.mean),
      lo: rows.map(r => r.mean - r.ci),
      hi: rows.map(r => r.mean + r.ci)
    };
  });
  drawLineChart($('sensChart'), {
    xs, series, yMax: sens.victims, xLabel: sens.option.label + '(' + sens.option.unit + ')', yLabel: '평균 구조 인원(명)',
    dots: true, unit: '명', xUnit: sens.option.unit, digits: 1, endLabels: true, height: 320,
    ariaLabel: sens.option.label + '에 따른 세 팀의 평균 구조 인원'
  });

  const leads = sens.results.map(r => {
    const diff = pairedDiff(r.stats.robot.rescued, r.stats.human.rescued);
    return diff.clear ? Math.sign(diff.mean) : 0;
  });
  const describe = sign => (sign > 0 ? '로봇 팀 우세' : sign < 0 ? '인간 팀 우세' : '차이 작음');
  const unit = sens.option.unit;
  const has = sign => leads.includes(sign);
  let message;
  if (has(1) && has(-1)) {
    const marks = xs.map((x, i) => ({ x, lead: leads[i] })).filter(item => item.lead !== 0);
    const flip = marks.findIndex((item, i) => i > 0 && item.lead !== marks[i - 1].lead);
    message = marks[flip - 1].x + unit + '~' + marks[flip].x + unit + ' 사이에서 앞서는 팀이 ' +
      describe(marks[flip - 1].lead).replace(' 우세', '') + '에서 ' + describe(marks[flip].lead).replace(' 우세', '') +
      '으로 바뀌었어요. 이 가정값은 결론을 뒤집을 만큼 중요해요.';
  } else if (leads.every(v => v === leads[0])) {
    message = leads[0] === 0
      ? '시험한 값 모두에서 로봇 팀과 인간 팀의 차이가 뚜렷하지 않았어요.'
      : '시험한 값 모두에서 ' + describe(leads[0]) + '예요. 이 가정값을 바꿔도 로봇과 인간의 순위는 그대로예요.';
  } else {
    message = '값에 따라 ' + describe(has(1) ? 1 : -1) + '와 차이가 작은 구간으로 나뉘어요. 순위가 뒤집히지는 않았지만 이 값의 영향을 받아요.';
  }
  $('sensText').textContent = message;
  $('sensMeta').textContent = '위험도 ' + sens.hazard + '%, 잔해 ' + sens.rubble + '%. 값마다 ' + sens.repeats + '회 반복한 평균이고, 옅은 띠는 95% 신뢰구간이에요.';
}

/* ---------- 4단계: 가정값 입력 ---------- */

function buildParamForm() {
  PARAMS.forEach(item => {
    const box = $('params-' + item.group);
    const row = document.createElement('div');
    row.className = 'param';
    const label = document.createElement('label');
    label.htmlFor = 'p-' + item.key;
    label.textContent = item.label;
    const wrap = document.createElement('span');
    wrap.className = 'param-input';
    const input = document.createElement('input');
    input.type = 'number';
    input.id = 'p-' + item.key;
    input.min = item.min;
    input.max = item.max;
    input.step = item.step;
    input.value = item.def;
    const unit = document.createElement('span');
    unit.className = 'unit';
    unit.textContent = item.unit;
    wrap.append(input, unit);
    row.append(label, wrap);
    if (item.note) {
      const note = document.createElement('p');
      note.className = 'param-note';
      note.textContent = item.note;
      row.appendChild(note);
    }
    box.appendChild(row);
    input.addEventListener('change', () => {
      let value = Number(input.value);
      if (!Number.isFinite(value)) value = item.def;
      value = Math.min(item.max, Math.max(item.min, value));
      input.value = value;
      ui.params[item.key] = value;
      row.classList.toggle('is-changed', value !== item.def);
      paramsChanged();
    });
  });
}

function paramsChanged() {
  const changed = PARAMS.filter(item => ui.params[item.key] !== item.def).length;
  $('paramCount').textContent = changed ? '기본값에서 ' + changed + '개 바꿨어요.' : '모두 기본값이에요.';
  $('expStale').hidden = false;
  $('sensStale').hidden = false;
  newLive();
}

function resetParams() {
  ui.params = defaultParams();
  PARAMS.forEach(item => {
    const input = $('p-' + item.key);
    input.value = item.def;
    input.closest('.param').classList.remove('is-changed');
  });
  paramsChanged();
}

/* ---------- 조작 연결 ---------- */

function bindControls() {
  const syncSlider = () => {
    $('hazardValue').textContent = $('hazard').value + '%';
    $('rubbleValue').textContent = $('rubble').value + '%';
  };
  ['hazard', 'rubble'].forEach(id => {
    $(id).addEventListener('input', () => { syncSlider(); newLive(); });
  });
  syncSlider();

  $('siteSeed').addEventListener('change', newLive);
  $('newSite').addEventListener('click', () => {
    $('siteSeed').value = 1000 + Math.floor(Math.random() * 9000);
    newLive();
  });
  $('restart').addEventListener('click', () => {
    const playing = ui.live.playing;
    ui.live.playing = false;
    newLive();
    if (playing || !prefersStill()) play();
  });
  $('playToggle').addEventListener('click', () => {
    if (ui.live.playing) stopPlay();
    else play();
  });
  document.querySelectorAll('[data-speed]').forEach(button => {
    button.addEventListener('click', () => {
      ui.live.speed = Number(button.dataset.speed);
      updatePlayButton();
    });
  });

  $('runExp').addEventListener('click', () => { runExperiment(); });
  $('lineRubble').addEventListener('change', event => {
    ui.rubblePick = Number(event.target.value);
    renderExperiment();
  });
  $('diffPair').addEventListener('change', event => {
    ui.diffPair = event.target.value;
    renderExperiment();
  });
  $('copyTable').addEventListener('click', event => {
    if (ui.exp) copyText(tableText(), 'copyStatus', event.currentTarget);
  });

  const select = $('sensParam');
  SENS_OPTIONS.forEach(item => {
    const option = document.createElement('option');
    option.value = item.key;
    option.textContent = item.label;
    select.appendChild(option);
  });
  $('runSens').addEventListener('click', () => { runSensitivity(); });
  ['sensParam', 'sensHazard', 'sensRubble'].forEach(id => {
    $(id).addEventListener('change', () => { runSensitivity(); });
  });
  $('resetParams').addEventListener('click', resetParams);

  // 창 크기가 바뀌면 지도와 차트를 다시 그립니다.
  let pending = 0;
  const resize = () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      sizeMaps();
      renderLive(true);
      ui.charts.forEach(box => { if (box._opt) drawLineChart(box, box._opt); });
    });
  };
  window.addEventListener('resize', resize);

  // 화면 테마가 바뀌면 지도 색을 다시 읽습니다.
  const retheme = () => {
    readColors();
    if (ui.live) {
      ui.live.layer = null;
      renderLive(false);
    }
  };
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme);
  new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

function init() {
  readColors();
  buildParamForm();
  bindControls();
  newLive();
  // 글꼴이 늦게 도착해도 지도 축척 글자가 맞도록 한 번 더 그립니다.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { if (ui.live) { ui.live.layer = null; renderLive(true); } });
  }
  runExperiment().then(runSensitivity);
}

/* 브라우저에서는 화면을 시작하고, Node.js에서는 모델만 불러와 시험할 수 있습니다. */
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
} else if (typeof module !== 'undefined') {
  module.exports = { makeSite, Sim, runTrial, summarize, pairedDiff, defaultParams, trialSeed, HAZARD_LEVELS, RUBBLE_LEVELS, TEAM_KEYS, N, WALL, RUBBLE };
}
