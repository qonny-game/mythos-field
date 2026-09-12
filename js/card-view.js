/* ============================================================
   card-view.js — カードの見た目・詳細表示担当ファイル

   ここには「カード1枚をどんなHTMLで組み立てるか」
   （種別ラベル・数値バッジ・カード名・効果文など）と、
   「ステータスタグの表示」「サイドパネルにカード詳細を表示する
   処理」がまとまっている。

   カードの見た目そのものを変えたい・カード詳細パネルの
   表示項目を増やしたい、という時はまずこのファイルを開く。
   実際の色やレイアウトは style.css 側を触ること。

   このファイルは card-rules.js、stat-effects.js より後に
   読み込む必要がある（STATUS_LABEL 等を参照するため）。
   ============================================================ */


let displayedStats = { player: { hp: null, mp: null, guard: null }, enemy: { hp: null, mp: null, guard: null } };
// 「授かった直後のフェードイン演出」を既に1回再生したカードのUIDを記録しておく。
// is-new が付いている間、renderHand は何度も呼ばれるが、この Set に入っているカードには
// もうフェードイン用クラス（is-new-appear）を付けない＝再生は最初の1回だけになる。
const newCardAppearPlayed = new Set();

function animateNumber(elId, from, to, duration = 400) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (from === null || from === undefined || from === to) {
    el.textContent = `${to}`;
    return;
  }
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 2); // ease-out
    const current = Math.round(from + (to - from) * eased);
    el.textContent = `${current}`;
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = `${to}`;
  }
  requestAnimationFrame(tick);
}


function renderStatus(elId, entity) {
  const el = document.getElementById(elId);
  const tags = [];
  if (entity.shield > 0) tags.push(`<span class="status-tag">護り+${entity.shield}</span>`);
  if (entity.dodge) tags.push(`<span class="status-tag">回避態勢</span>`);
  entity.statuses.forEach(s => {
    const turnsText = typeof s.turns === 'number' ? `(残${s.turns})` : '';
    tags.push(`<span class="status-tag ${STATUS_COLOR_CLASS[s.type]}">${STATUS_ICON[s.type]}${STATUS_LABEL[s.type]}${turnsText}</span>`);
  });
  el.innerHTML = tags.join('');
}

const LEGEND_LABEL = {
  mpDamage: 'MP×2攻撃',
  mpDefense: 'MP×2防御',
  drainMp: 'MP完全封印',
  reflect: '反射・無傷',
  nullify: '完全無効化',
  doubleAttack: '2回攻撃',
};

function powerLabel(c) {
  if (c.legend && LEGEND_LABEL[c.legend] && c.power === undefined) return LEGEND_LABEL[c.legend];
  if (c.power === undefined) return c.cost !== undefined ? `MP${c.cost}` : '';
  const kind = c.type === 'armor' ? '防' : '攻';
  const attrPrefix = c.attr ? c.attr : '';
  return `${attrPrefix}${kind}${c.power}`;
}

function bcCardClass(c) {
  if (c.legend || c.badge === 'legend') return 'is-legend-card';
  if (c.blessing || c.badge === 'bless') return 'is-bless-card';
  if (c.curse2 || c.badge === 'curse') return 'is-curse-card';
  return '';
}

// item系カードの色分けクラス（HP回復=緑／MP回復=水色／両方=グラデーション／PLUS攻撃=赤／PLUS護り=濃青）
function itemCardClass(c) {
  if (c.type !== 'item') return '';
  if (typeof c.plusBonus === 'number') return 'is-plus-atk-card';
  const h = c.heal || c.buyEffect;
  if (h) {
    if (h.hp && h.mp) return 'is-heal-dual-card';
    if (h.hp) return 'is-heal-hp-card';
    if (h.mp) return 'is-heal-mp-card';
    if (h.shield) return 'is-plus-def-card';
  }
  return '';
}

// 伝/幸/呪の巨大な透かし文字は廃止済み。呼び出し箇所は残っているが、ここで何も返さないことで無害化している。
function bcWatermarkHtml(c) {
  return '';
}

// カードに絵（cards.js の art フィールド）が設定されていれば、うっすら背景として敷くレイヤーを返す。
// 未設定なら何も出さない（今まで通りの見た目のまま）。
function cardArtHtml(c) {
  if (!c.art) return '';
  return `<div class="card-art" style="background-image:url('${c.art}')"></div>`;
}

// 伝説カード（is-legend-card）専用：常時ふわふわ舞う光の粒子を複数個ばらまく。
// 各粒の位置・遅延はCSS側の nth-child でずらしてあり、ここでは決まった数のdivを出すだけでよい。
function legendSparkleHtml(c) {
  if (!(c.legend || c.badge === 'legend')) return '';
  let html = '<div class="legend-sparkle-layer">';
  for (let i = 0; i < 8; i++) {
    html += '<div class="legend-sparkle"></div>';
  }
  html += '</div>';
  return html;
}

// instant: true（ターン消費なしのパッシブ系カード）に付けるアイコン。
// ブーツ＝身軽にすぐ動ける、というイメージでターンを消費しないことを示す。
// instantアイコン（ブーツの透かし文字）は廃止済み。呼び出し箇所は残っているが、ここで何も返さないことで無害化している。
// instant: true（ターン消費なしのパッシブ系カード）に付けるアイコン。左下に小さく表示する（仮実装）。
function instantIconHtml(c) {
  if (!c.instant) return '';
  return `<div class="instant-badge" title="ターン消費なし">👢</div>`;
}

// カード左上に属性を小さく表示する（仮実装：位置・見た目は後で調整予定）
function cardTopLeftAttrHtml(c) {
  if (!c.attr) return '';
  return `<div class="attr-badge attr-${c.attr}">${c.attr}</div>`;
}

// カード右上：このカードが状態異常付与効果（inflictStatus）を持っている場合、
// 丸い背景に絵文字アイコンを乗せて常時表示する。複数種類持つカードは先頭の1つだけ代表で出す。
function cardTopRightStatusHtml(c) {
  if (!c.inflictStatus) return '';
  const type = Array.isArray(c.inflictStatus) ? c.inflictStatus[0] : c.inflictStatus;
  return `<div class="status-badge ${STATUS_COLOR_CLASS[type]}" title="${STATUS_LABEL[type]}付与">${STATUS_ICON[type]}</div>`;
}

// カード底辺に表示するカード名。入りきらない長さの名前は自動的に省略（...）表示になる。
function cardNameFooterHtml(c) {
  return `<div class="card-name-footer" title="${c.name}">${c.name}</div>`;
}

function blessCurseTagHtml(c) {
  return ''; // 透かし文字表示に統一したため、インラインバッジは廃止
}

function powerBadgeHtml(c, asDefense, defenseMultiplier) {
  const bc = blessCurseTagHtml(c);
  if (c.type === 'item' || c.type === 'trade') {
    return itemBadgeHtml(c); // 雑貨・PLUSカード・購入アイテム用の専用レイアウト
  }
  // 防御選択時は defense フィールドを優先表示（plus は攻撃専用なので付与しない）。
  // defense フィールドが無い防具（power のみ）でも、防御表示モードなら power を防御力として扱う。
  const showAsDefense = asDefense && (typeof c.defense === 'number' || typeof c.power === 'number');
  if (!showAsDefense && c.power === undefined) {
    const label = powerLabel(c);
    return `
      ${bc}
      <div class="cf-headrow"><span class="cf-num cf-num-text">${label || '-'}</span></div>
      <div class="cf-divider"></div>
      ${c.effect ? `<span class="cf-effect">${c.effect}</span>` : ''}
    `;
  }
  const kind = showAsDefense ? '防御' : (c.type === 'armor' ? '防御' : '攻撃');
  // 防御表示のときは、属性相性の倍率（defenseMultiplier）を実際の数値に反映する
  const rawValue = showAsDefense ? (typeof c.defense === 'number' ? c.defense : c.power) : c.power;
  const mult = (showAsDefense && typeof defenseMultiplier === 'number') ? defenseMultiplier : 1;
  const numValue = mult !== 1 ? Math.round(rawValue * mult * 10) / 10 : rawValue;
  const attrText = c.attr || '';
  const statIconClass = kind === '防御' ? 'stat-icon-defense' : 'stat-icon-attack';
  return `
    ${bc}
    <div class="cf-headrow">
      <span class="cf-kind">${kind}</span>${attrText ? `<span class="cf-attr attr-${attrText}">${attrText}</span>` : ''}
    </div>
    <span class="cf-num ${statIconClass}">${numValue}</span>
    <div class="cf-divider"></div>
    ${c.effect ? `<span class="cf-effect">${c.effect}</span>` : ''}
  `;
}

// 雑貨（回復アイテム・購入アイテム・PLUSカードなど）のカード面表示。
// 攻撃/防具カードと似た「種別／数値」の2段レイアウトに揃える。
function itemBadgeHtml(c) {
  const bc = blessCurseTagHtml(c);

  // PLUSカード：攻撃準備フェイズで選べる攻撃力アップ札（赤）
  if (typeof c.plusBonus === 'number') {
    return `
      ${bc}
      <div class="cf-headrow"><span class="cf-kind">PLUS</span></div>
      <span class="cf-num cf-num-plus-atk stat-icon-attack">+${c.plusBonus}</span>
      <div class="cf-divider"></div>
      ${c.effect ? `<span class="cf-effect">${c.effect}</span>` : ''}
    `;
  }

  // 購入アイテム（お金を払って使う）
  if (c.buyEffect) {
    const b = c.buyEffect;
    return `
      ${bc}
      ${itemNumRows({ hp: b.hp, mp: b.mp })}
      <div class="cf-divider"></div>
      <span class="cf-effect">${b.cost}Gで購入${c.rare ? '・レア' : ''}</span>
    `;
  }

  // 通常の無料回復・護りアイテム
  const h = c.heal;
  if (h) {
    if (h.hp || h.mp) {
      return `
        ${bc}
        ${itemNumRows({ hp: h.hp, mp: h.mp })}
        <div class="cf-divider"></div>
        ${c.effect ? `<span class="cf-effect">${c.effect}</span>` : ''}
      `;
    }
    if (h.shield) {
      // 護りPLUS：濃い青
      return `
        ${bc}
        <div class="cf-headrow"><span class="cf-kind">護り</span></div>
        <span class="cf-num cf-num-plus-def stat-icon-defense">+${h.shield}</span>
        <div class="cf-divider"></div>
        ${c.effect ? `<span class="cf-effect">${c.effect}</span>` : ''}
      `;
    }
    if (h.cure) {
      return `
        ${bc}
        <div class="cf-headrow"><span class="cf-kind">状態異常</span></div>
        <span class="cf-num cf-num-text">回復</span>
        <div class="cf-divider"></div>
        ${c.effect ? `<span class="cf-effect">${c.effect}</span>` : ''}
      `;
    }
  }

  // その他（両替など、数値で表現しにくいカード）
  return `
    ${bc}
    <div class="cf-headrow"><span class="cf-kind">${TYPE_LABEL[c.type] || ''}</span></div>
    <div class="cf-divider"></div>
    ${c.effect ? `<span class="cf-effect">${c.effect}</span>` : ''}
  `;
}

// HP回復（緑）・MP回復（水色）の数値行を組み立てる。両方あれば2段（縦グラデーション背景）、
// 片方だけなら1段（単色背景）にする。
function itemNumRows(amounts) {
  const hasHp = !!amounts.hp;
  const hasMp = !!amounts.mp;
  if (hasHp && hasMp) {
    return `
      <div class="cf-headrow"><span class="cf-kind">回復</span></div>
      <div class="cf-num-dual">
        <span class="cf-num-row cf-num-row-hp">HP <b>+${amounts.hp}</b></span>
        <span class="cf-num-row cf-num-row-mp">MP <b>+${amounts.mp}</b></span>
      </div>
    `;
  }
  if (hasHp) {
    return `
      <div class="cf-headrow"><span class="cf-kind">回復 HP</span></div>
      <span class="cf-num cf-num-heal-hp stat-icon-heal-hp">+${amounts.hp}</span>
    `;
  }
  if (hasMp) {
    return `
      <div class="cf-headrow"><span class="cf-kind">回復 MP</span></div>
      <span class="cf-num cf-num-heal-mp stat-icon-heal-mp">+${amounts.mp}</span>
    `;
  }
  return `<div class="cf-headrow"></div>`;
}

function healBadge(c) {
  if (c.type !== 'item') return '';
  if (typeof c.plusBonus === 'number') return `<span class="heal-badge plus">攻撃力+${c.plusBonus}</span>`;
  if (c.buyEffect) {
    const b = c.buyEffect;
    const parts = [];
    if (b.hp) parts.push(`<span class="heal-badge hp">HP+${b.hp}</span>`);
    if (b.mp) parts.push(`<span class="heal-badge mp">MP+${b.mp}</span>`);
    parts.push(`<span class="heal-badge cost">${b.cost}G</span>`);
    if (c.rare) parts.push(`<span class="heal-badge rare">レア</span>`);
    return parts.join('');
  }
  if (!c.heal) return '';
  const parts = [];
  if (c.heal.hp) parts.push(`<span class="heal-badge hp">HP+${c.heal.hp}</span>`);
  if (c.heal.mp) parts.push(`<span class="heal-badge mp">MP+${c.heal.mp}</span>`);
  if (c.heal.shield) parts.push(`<span class="heal-badge shield">護+${c.heal.shield}</span>`);
  if (c.heal.cure) parts.push(`<span class="heal-badge cure">状態回復</span>`);
  return parts.join('');
}

// 攻撃フェイズ開始〜バトル終了まで、上段中央パネルの背景を1枚目の攻撃カードの絵に固定する。
// 固定中はホバーで他のカードを見ても、背景（絵）だけは切り替わらない（文字は今まで通り変化する）。
function pinDetailArt(card) {
  state.pinnedDetailArt = card && card.art ? card.art : null;
  const panelEl = document.getElementById('cardDetailPanel');
  if (!panelEl) return;
  if (state.pinnedDetailArt) {
    panelEl.style.setProperty('--card-art-url', `url('${state.pinnedDetailArt}')`);
    panelEl.classList.add('has-art');
  } else {
    // 絵を持たないカードで固定しようとした場合は、背景なしの状態に固定する
    panelEl.style.removeProperty('--card-art-url');
    panelEl.classList.remove('has-art');
  }
}

// バトル終了時に呼ぶ。固定を解除し、背景をいったんクリアする（次のホバーで通常通り切り替わるようになる）。
function unpinDetailArt() {
  state.pinnedDetailArt = null;
  const panelEl = document.getElementById('cardDetailPanel');
  if (panelEl) {
    panelEl.style.removeProperty('--card-art-url');
    panelEl.classList.remove('has-art');
  }
}

function showCardDetail(c, ids, asDefense, defenseMultiplier) {
  // 中央パネル（cardDetailStatEffect）が数値演出で表示中は、ホバーによる詳細切り替えを無視する。
  // （マウスがカード上に乗ったままだと、演出中に割り込んで表示が重なってしまうため）
  if (!ids && isCardDetailStatEffectBusy) return;
  // デフォルトは左サイドの詳細パネル。中央上部の cardDetailPanel は役目を終え、空欄のまま維持する。
  ids = ids || { placeholder: 'sideDetailPlaceholder', content: 'sideDetailContent' };
  const placeholder = document.getElementById(ids.placeholder);
  const content = document.getElementById(ids.content);
  if (!placeholder || !content) return;
  if (!c) {
    placeholder.style.display = 'flex';
    content.style.display = 'none';
    return;
  }
  placeholder.style.display = 'none';
  content.style.display = 'flex';

  // カード絵柄：デッキ表示などと同じ組み立て方で、そのまま .card 要素として差し込む
  const cardEl = document.getElementById('sideDetailCard');
  if (cardEl) {
    cardEl.className = `card card-simplified side-detail-card type-${c.type} ${c.legend ? 'is-legend':''} ${bcCardClass(c)} ${itemCardClass(c)}`;
    cardEl.innerHTML = `
      <div class="card-type-bar"></div>
      ${cardArtHtml(c)}
      ${legendSparkleHtml(c)}
      ${bcWatermarkHtml(c)}
      ${instantIconHtml(c)}
      ${cardTopLeftAttrHtml(c)}
      ${cardTopRightStatusHtml(c)}
      ${cardNameFooterHtml(c)}
      <div class="card-face">
        ${powerBadgeHtml(c, asDefense, defenseMultiplier)}
      </div>
    `;
  }

  document.getElementById('sdName').textContent = c.name;
  document.getElementById('sdType').textContent = TYPE_LABEL[c.type] || '';
  document.getElementById('sdMyth').textContent = c.myth || '共通';
  document.getElementById('sdAttr').textContent = c.attr || '無';

  const showAsDefense = asDefense && (typeof c.defense === 'number' || typeof c.power === 'number');
  const numRow = document.getElementById('sdNumRow');
  const numLabel = document.getElementById('sdNumLabel');
  const numValueEl = document.getElementById('sdNumValue');
  if (c.type === 'item') {
    numRow.style.display = 'none';
  } else if (!showAsDefense && c.power === undefined) {
    if (powerLabel(c)) {
      numRow.style.display = 'flex';
      numLabel.textContent = '効果';
      numValueEl.textContent = powerLabel(c);
    } else {
      numRow.style.display = 'none';
    }
  } else {
    const rawValue = showAsDefense ? (typeof c.defense === 'number' ? c.defense : c.power) : c.power;
    const mult = (showAsDefense && typeof defenseMultiplier === 'number') ? defenseMultiplier : 1;
    const numValue = mult !== 1 ? Math.round(rawValue * mult * 10) / 10 : rawValue;
    numRow.style.display = 'flex';
    numLabel.textContent = showAsDefense ? '防御力' : (c.type === 'armor' ? '防御力' : '攻撃力');
    numValueEl.textContent = numValue;
  }

  document.getElementById('sdEffect').textContent = c.effect || '';
}

// 防御フェイズ中は、上段のカード詳細パネル（cardDetailPanel）をそのまま使い回す。
// デフォルトで「相手の攻撃カード」情報を表示し、防具にホバーした時だけ切り替わる。
function showDefenseCardDetail(c, asDefense, defenseMultiplier) {
  showCardDetail(c, null, asDefense, defenseMultiplier);
}
