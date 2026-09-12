/* ============================================================
   card-rules.js — カードのルール・データ担当ファイル

   ここには「カードの中身そのもの」ではなく、カードを扱うための
   ルールや計算式が書いてある。具体的には：
   - 属性の相性表（火は水に2倍で防がれる、など）
   - 状態異常（毒・暗闇・閃光・呪い・混乱）の定義と共通処理
   - カードを引く時の出現率・抽選ロジック
   - 手札の並び順、種別分類、捨てるべきカードの判定など

   このファイルは cards.js（カードデータ本体）より後、
   他の全てのファイルより前に読み込む必要がある。
   ============================================================ */


const TYPE_LABEL = {weapon:"武器", armor:"防具", item:"雑貨", magic:"魔法", miracle:"奇跡", trade:"取引"};
const OPPOSED = {"火":"水","水":"火","木":"土","土":"木"};

/* ===================== 属性相性・防御倍率テーブル =====================
   [攻撃属性][防具属性] = 防御倍率（数値）。倍率が無い組み合わせ（undefined）は「防御不可」を意味する。
   defense（防御力）に、選んだ防具それぞれの倍率を掛け合わせて実際の防御力を計算する。

   - 火水・木土は対の属性同士で2倍、同じ属性は1倍、無関係な組み合わせは0.5倍
   - 光防具はどんな攻撃に対しても万能で1倍（ただし光属性の防具自体は火水木土同士の相性ルールには含まれない）
   - 闇防具はALL0.5倍、ただし無属性の攻撃には2倍、闇属性の攻撃には1倍、光属性の攻撃は防げない
   - 無属性の防具は無属性の攻撃だけ1倍で防げる。属性を持つ攻撃は一切防げない
   - 光・闇属性の攻撃は、光防具でしか防げない（闇属性の攻撃だけ、闇防具でも1倍で防げる）
   - 無属性の攻撃はどんな属性の防具でも一律1倍で防げる
   ============================================================ */
const ATTR_DEFENSE_MULTIPLIER = {
  "火": { "火": 1, "水": 2, "木": 0.5, "土": 0.5, "光": 1, "闇": 0.5 },
  "水": { "火": 2, "水": 1, "木": 0.5, "土": 0.5, "光": 1, "闇": 0.5 },
  "木": { "火": 0.5, "水": 0.5, "木": 1, "土": 2, "光": 1, "闇": 0.5 },
  "土": { "火": 0.5, "水": 0.5, "木": 2, "土": 1, "光": 1, "闇": 0.5 },
  "光": { "光": 1 },
  "闇": { "光": 1, "闇": 1 },
  "無": { "火": 1, "水": 1, "木": 1, "土": 1, "光": 1, "闇": 1, "無": 1 },
};
// 攻撃属性・防具属性の組み合わせから防御倍率を引く。組み合わせが無ければ null（＝防御不可）を返す。
function getDefenseMultiplier(attackAttr, armorAttr) {
  const attackKey = attackAttr || "無";
  const armorKey = armorAttr || "無";
  const table = ATTR_DEFENSE_MULTIPLIER[attackKey];
  if (!table || !(armorKey in table)) return null;
  return table[armorKey];
}

/* ===================== 状態異常システム =====================
   entity.statuses は {type, turns} オブジェクトの配列。
   turns が null なら「治すまで」永続、数値ならその数だけターン経過で自然回復する。
   ============================================================ */
const STATUS_TYPES = ['poison', 'blind', 'flash', 'curse', 'confusion'];
const STATUS_LABEL = { poison: '毒', blind: '暗', flash: '閃', curse: '呪', confusion: '混' };
const STATUS_ICON = { poison: '☠️', blind: '🌑', flash: '⚡', curse: '💀', confusion: '💫' };
const STATUS_COLOR_CLASS = {
  poison: 'status-poison',
  blind: 'status-blind',
  flash: 'status-flash',
  curse: 'status-curse',
  confusion: 'status-confusion',
};

function hasStatus(entity, type) {
  return entity.statuses.some(s => s.type === type);
}

function inflictStatus(who, entity, type, turns, logSuffix) {
  // 同じ状態異常を重ねて付与した場合、上書き（新しい turns で置き換える）
  const existing = entity.statuses.find(s => s.type === type);
  if (existing) {
    existing.turns = (turns === undefined) ? null : turns;
  } else {
    entity.statuses.push({ type, turns: (turns === undefined) ? null : turns });
  }
  const label = who === 'player' ? 'あなた' : '影';
  addLog(`${label}は${STATUS_LABEL[type]}状態になった${logSuffix ? '：' + logSuffix : ''}`, 'system');
}

function cureStatus(entity, type) {
  entity.statuses = entity.statuses.filter(s => s.type !== type);
}

function cureAllStatuses(entity) {
  entity.statuses = [];
}

function inflictRandomStatus(who, entity) {
  const type = STATUS_TYPES[Math.floor(Math.random() * STATUS_TYPES.length)];
  inflictStatus(who, entity, type);
}

// ターン開始時に呼ぶ：毒ダメージの適用と、ターン経過による自然回復（turnsが数値のものだけ）を行う。
// ターン交代が起きる箇所（通常のターン終了、攻撃後の防御側ターン開始、CPU即時ターンなど）全てから呼ぶ必要がある。
function tickStatusesAtTurnStart(who, entity) {
  if (hasStatus(entity, 'poison')) {
    entity.hp = Math.max(0, entity.hp - 5);
    const label = who === 'player' ? 'あなた' : '影';
    addLog(`${label}は毒によって5のダメージを受けた`, 'hit');
    showActionTextOnly(who, '☠️毒でダメージ！', 'status-poison');
    queueStatEffect(who, 'curse', 5);
  }
  entity.statuses.forEach(s => {
    if (typeof s.turns === 'number') s.turns -= 1;
  });
  entity.statuses = entity.statuses.filter(s => s.turns === null || s.turns > 0);
}

/* ===================== カード出現率 =====================
   まず種別（type）を確率で決め、その種別の中からさらにバッジ（badge）で確率を絞り込む、
   という2段階の抽選。trade型は item 枠に含めて扱う。

   種別ごとの出現率（合計100%）:
     weapon 25% / armor 25% / item 20%（trade含む） / magic 15% / miracle 15%
   種別が決まった後、その中でのバッジ出現率:
     legend 1% / curse 5% / bless 5% / バッジなし 89%
   選んだ種別×バッジの組み合わせに該当カードが1枚もない場合は、
   「バッジなし」の同じ種別から抽選し直す（type自体は変えない）。
   ============================================================ */
const TYPE_DRAW_RATES = [
  { type: 'weapon', rate: 0.35 },
  { type: 'armor',  rate: 0.45 },
  { type: 'item',   rate: 0.07 }, // trade もここに含める
  { type: 'magic',  rate: 0.07 },
  { type: 'miracle', rate: 0.06 },
];
const BADGE_DRAW_RATES = [
  { badge: 'legend', rate: 0.2 },
  { badge: 'curse',  rate: 0.2 },
  { badge: 'bless',  rate: 0.2 },
  // 残り40%はバッジなし
];

// type別・badge別にカードをあらかじめ分類しておく（trade は item 扱いに統合）
function poolType(c) { return c.type === 'trade' ? 'item' : c.type; }
const CARD_POOLS = {}; // CARD_POOLS[type][badge or 'none'] = カード配列
const CARD_POOLS_ALL = {}; // CARD_POOLS_ALL[type] = そのtypeの全カード（badge問わず、フォールバック用）
TYPE_DRAW_RATES.forEach(({ type }) => {
  CARD_POOLS[type] = { none: [] };
  BADGE_DRAW_RATES.forEach(({ badge }) => { CARD_POOLS[type][badge] = []; });
  CARD_POOLS_ALL[type] = [];
});
CARDS.forEach(c => {
  const t = poolType(c);
  if (!CARD_POOLS[t]) return; // 未対応のtypeは抽選対象外（今のところ全type対応済み）
  const key = CARD_POOLS[t][c.badge] ? c.badge : 'none';
  CARD_POOLS[t][key].push(c);
  CARD_POOLS_ALL[t].push(c);
});

// 重み付きで1件選ぶ。table は [{key, rate}, ...] の形。合計が1未満なら残りは「選ばれない（＝別扱い）」。
function pickWeighted(table) {
  const r = Math.random();
  let acc = 0;
  for (const entry of table) {
    acc += entry.rate;
    if (r < acc) return entry;
  }
  return null; // 残り確率（テーブルに無い分＝デフォルト扱い）
}

function drawCard() {
  const typeEntry = pickWeighted(TYPE_DRAW_RATES);
  const type = typeEntry ? typeEntry.type : TYPE_DRAW_RATES[TYPE_DRAW_RATES.length - 1].type;

  const badgeEntry = pickWeighted(BADGE_DRAW_RATES);
  const badgeKey = badgeEntry ? badgeEntry.badge : 'none';

  let pool = CARD_POOLS[type][badgeKey];
  if (!pool || pool.length === 0) {
    // この種別にそのバッジのカードが無ければ、バッジなしの同じ種別から選び直す
    pool = CARD_POOLS[type].none;
  }
  if (!pool || pool.length === 0) {
    // バッジなしも無い種別（今のところ起きないはずだが）は、同じ種別の全カードから選ぶ
    pool = CARD_POOLS_ALL[type];
  }
  if (!pool || pool.length === 0) {
    // それでも空なら（理論上起きないはずだが安全のため）カード全体から選ぶ
    pool = CARDS;
  }

  return {...pool[Math.floor(Math.random()*pool.length)], _uid: Math.random().toString(36).slice(2)};
}


const CATEGORY_ORDER = ['attack', 'defense', 'support'];
const CATEGORY_LABEL = { attack: '攻撃系', defense: '防御系', support: 'サポート系' };
function cardCategory(c) {
  if (c.type === 'weapon') return 'attack';
  if (c.type === 'magic') return 'attack';
  if (c.type === 'armor') return 'defense';
  if (c.type === 'miracle') return c.power !== undefined ? 'attack' : 'support';
  return 'support'; // item, trade
}

// デッキ（手札）の並び順：種別（武器→防具→アイテム、それ以外は末尾）→種別ごとの数値順
const TYPE_SORT_ORDER = { weapon: 0, armor: 1, item: 2, magic: 3, miracle: 4, trade: 5 };
function handSortValue(c) {
  // 種別内の第2ソートキー：数値が大きいほど手前に来るよう「大きいほど小さい値」を返す
  if (c.type === 'weapon' || c.type === 'magic') {
    // 通常攻撃カード（power）とPLUSカード（plusBonus）は数値の意味が違うので、
    // グループを分けてから並べる（そうしないと数値がたまたま近いだけで混ざってしまう）
    if (typeof c.plusBonus === 'number') return 1000 - c.plusBonus; // PLUS攻撃カードのグループ
    const power = (c.power || 0) + (typeof c.plus === 'number' ? c.plus : 0);
    return -power; // 通常攻撃カードのグループ
  }
  if (c.type === 'armor') {
    const def = typeof c.defense === 'number' ? c.defense : (c.power || 0);
    return -def;
  }
  if (c.type === 'item') {
    const h = c.heal || c.buyEffect;
    // 効果の種類ごとにまずグループ分けし、グループ内だけを効果量順に並べる。
    // （HP回復とMP回復を同じ数値軸で単純比較すると混ざってバラバラになるため、
    //   グループ番号を桁上げして絶対に混ざらないようにする）
    const HP_HEAL = 0, MP_HEAL = 1, SHIELD = 2, CURE = 3, OTHER = 4;
    let group = OTHER, value = 0;
    if (h && h.hp)          { group = HP_HEAL; value = -h.hp; }
    else if (h && h.mp)     { group = MP_HEAL; value = -h.mp; }
    else if (h && h.shield) { group = SHIELD;  value = -h.shield; }
    else if (h && h.cure)   { group = CURE;    value = 0; }
    return group * 1000 + value;
  }
  return 0;
}
function compareHandCards(a, b) {
  const orderA = TYPE_SORT_ORDER[a.type] ?? 99;
  const orderB = TYPE_SORT_ORDER[b.type] ?? 99;
  if (orderA !== orderB) return orderA - orderB;
  return handSortValue(a) - handSortValue(b);
}

// PLUSカード：攻撃準備フェイズで追加選択し、攻撃力に plusBonus 分を上乗せできるカード
function isPlusCard(c) {
  return typeof c.plusBonus === 'number';
}

function hasAttackCard(hand) {
  return hand.some(c => cardCategory(c) === 'attack');
}

const DISCARD_MAX = 3;

// カード1枚の「不要度」スコア。高いほど優先的に捨てたい。CPUの自動選択に使う。
function discardUnneedScore(c, self) {
  let score = 0;
  const hpRatio = self.hp / 100; // 初期HPは100固定なので、簡易的にそのまま比率として使う
  const mpRatio = self.mp / 50;  // 初期MPは50固定

  // HP/MPが十分足りているのに回復系アイテムを持っている → 不要度が高い
  if (c.type === 'item' && c.heal) {
    if (c.heal.hp && hpRatio >= 0.8) score += 6;
    if (c.heal.mp && mpRatio >= 0.8) score += 6;
    if (!c.heal.hp && !c.heal.mp) score += 1; // 状態回復・護りなどは軽く不要寄り
  }

  // 攻撃力の低い武器・魔法は差し替え候補になりやすい
  if ((c.type === 'weapon' || c.type === 'magic') && typeof c.power === 'number') {
    if (c.power <= 4) score += 3;
    else if (c.power <= 8) score += 1;
  }

  // 防具は防御の要なので基本残す（不要度を下げる）
  if (c.type === 'armor') score -= 2;

  // 強力なカードは残したいので大きく減点
  if (c.badge === 'legend' || c.rare) score -= 8;
  if (c.legend) score -= 6; // 伝説の特殊効果を持つカード
  if (typeof c.castCostHp === 'number' || typeof c.castCostMp === 'number' || typeof c.castCostMoney === 'number') score -= 1; // 切り札級は基本強い

  return score;
}

// CPU用：不要度が高い順に最大DISCARD_MAX枚のインデックスを選ぶ（不要度が0以下のカードは選ばない）
function pickCpuDiscardIdxs(hand, self) {
  const scored = hand
    .map((c, i) => ({ i, score: discardUnneedScore(c, self) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, DISCARD_MAX).map(x => x.i);
}
