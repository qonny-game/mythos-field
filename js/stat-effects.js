/* ============================================================
   stat-effects.js — 数値演出・バトル演出担当ファイル

   ここには「HP/MPが増減する時のカウントアップ表示」「攻撃力・
   防御力のタイトル表示」「攻撃/防御カードがシュッと出てくる
   演出」など、戦闘中に画面が動く部分の見た目がまとまっている。

   演出の間隔・速さを変えたいときは anim-config.js（ANIM）を、
   演出の中身自体（何をどう見せるか）を変えたいときはこのファイルを開く。

   このファイルは anim-config.js（ANIM を使うため）と
   card-rules.js（一部の判定で使うため）より後に読み込む必要がある。
   ============================================================ */


const STAT_EFFECT_META = {
  'cost-hp':    { label: '消費',   sign: '-', unit: 'HP' },
  'cost-mp':    { label: '消費',   sign: '-', unit: 'MP' },
  'cost-money': { label: '消費',   sign: '-', unit: '', suffix: 'G' },
  atk:          { label: 'ダメージ', sign: '-', unit: 'HP' },
  'heal-hp':    { label: '回復',   sign: '+', unit: 'HP' },
  'heal-mp':    { label: '回復',   sign: '+', unit: 'MP' },
  curse:        { label: '呪い',   sign: '-', unit: 'HP' },
  guard:        { label: '加護',   sign: '+', unit: '加護' },
  'atk-preview': { label: '攻撃力', sign: '', unit: '', persistent: true },
  def:         { label: '防御力', sign: '', unit: '', persistent: true },
};

let statEffectQueue = [];
let statEffectRunning = false;
let statEffectEmptyCallbacks = []; // キューが空になった瞬間に1回だけ呼ばれる待ち受け関数のリスト
let isCardDetailStatEffectBusy = false; // 中央パネル（cardDetailStatEffect）が数値演出で使用中かどうか。
// 使用中は showCardDetail によるホバー詳細表示を無視して、演出の表示を守る。

// 演出キューの安全装置。タブが非アクティブになると setTimeout / requestAnimationFrame が
// 遅延・停止することがあり、演出の途中で止まってしまうとキューが「実行中」のまま固まって、
// ゲーム全体が進まなくなってしまう。それを防ぐため、1件の演出を開始するたびに
// 「一定時間経っても終わらなければ、キューを丸ごと強制的に空にする」タイマーをセットする。
const STAT_EFFECT_TIMEOUT_MS = 8000;
let statEffectTimeoutId = null;
let statEffectLastProgressAt = 0; // 演出が最後に1ステップ進んだ時刻（Date.now()）。タブ復帰時の判定に使う。
function armStatEffectTimeout() {
  statEffectLastProgressAt = Date.now();
  if (statEffectTimeoutId) clearTimeout(statEffectTimeoutId);
  statEffectTimeoutId = setTimeout(() => {
    if (statEffectRunning) {
      console.warn('演出が完了しないまま時間切れになったため、演出キューを強制的にリセットしました');
      forceResetStatEffectQueue();
    }
    statEffectTimeoutId = null;
  }, STAT_EFFECT_TIMEOUT_MS);
}
function disarmStatEffectTimeout() {
  if (statEffectTimeoutId) {
    clearTimeout(statEffectTimeoutId);
    statEffectTimeoutId = null;
  }
}
function forceResetStatEffectQueue() {
  statEffectQueue = [];
  statEffectRunning = false;
  isCardDetailStatEffectBusy = false;
  disarmStatEffectTimeout();
  const callbacks = statEffectEmptyCallbacks;
  statEffectEmptyCallbacks = [];
  callbacks.forEach(cb => cb());
  render();
}
// タブがバックグラウンドの間は setTimeout 自体の発火も止まることがあるため、8秒の安全装置だけでは
// 復旧できない場合がある。タブが再びアクティブになった瞬間に呼ばれ、演出が実行中のまま
// 一定時間（このタイムアウトの半分以上）更新されていなければ、止まっていると判断して強制リセットする。
function forceResetStatEffectQueueIfStuck() {
  if (statEffectRunning && (Date.now() - statEffectLastProgressAt) > STAT_EFFECT_TIMEOUT_MS / 2) {
    console.warn('タブ復帰時に演出キューが止まっていたため、強制的にリセットしました');
    forceResetStatEffectQueue();
  }
}

// who: 'player' | 'enemy'　　kind: 'cost-hp'|'cost-mp'|'cost-money'|'atk'|'heal-hp'|'heal-mp'|'curse'　　amount: 表示する数値（絶対値・0以下は無視）
// applyFn: 静止後に実際の値を変える処理（省略可）。render() はキュー側で自動的に呼ばれる。
// force: true を渡すと、amount が 0 でも「0」として表示する（防御力0の演出など）
function queueStatEffect(who, kind, amount, applyFn, force) {
  if ((!amount || amount <= 0) && !force) {
    if (applyFn) applyFn(); // 表示するほどの数値が無くても、反映処理自体は即座に行う
    return;
  }
  statEffectQueue.push({ who, kind, amount: amount || 0, applyFn });
  if (!statEffectRunning) processStatEffectQueue();
}

// キューに積まれている演出が全部終わった瞬間に一度だけ呼ばれる。
// 既に空でキューも動いていなければ、その場で即座に呼ぶ。
function onStatEffectQueueEmpty(callback) {
  if (statEffectQueue.length === 0 && !statEffectRunning) {
    callback();
  } else {
    statEffectEmptyCallbacks.push(callback);
  }
}

function processStatEffectQueue() {
  if (statEffectQueue.length === 0) {
    statEffectRunning = false;
    disarmStatEffectTimeout();
    const callbacks = statEffectEmptyCallbacks;
    statEffectEmptyCallbacks = [];
    callbacks.forEach(cb => cb());
    return;
  }
  statEffectRunning = true;
  armStatEffectTimeout();
  const { who, kind, amount, applyFn, text } = statEffectQueue.shift();
  const meta = STAT_EFFECT_META[kind];
  if (text) {
    playTextOnlyEffect(who, text, kind, () => {
      setTimeout(processStatEffectQueue, ANIM.statEffect.gapBetween);
    });
    return;
  }
  playStatEffect(who, kind, amount, () => {
    if (applyFn) applyFn();
    render();
    // persistent（攻撃力予告・防御力）は表示を消さないので、間を空けずすぐ次へ進んでよい
    setTimeout(processStatEffectQueue, meta.persistent ? 0 : ANIM.statEffect.gapBetween);
  });
}

// 攻撃力予告・防御力（persistent）を、行動数値枠からまとめてクリアする。
// 決着（実際のダメージ演出が始まる瞬間）に呼ぶ。
function clearActionPreview(who) {
  const el = document.getElementById(who === 'player' ? 'playerActionTotal' : 'enemyActionTotal');
  const topEl = document.getElementById(who === 'player' ? 'topPlayerActionTotal' : 'topEnemyActionTotal');
  if (el) el.innerHTML = '';
  if (topEl) topEl.innerHTML = '';
}
function clearAllActionPreviews() {
  clearActionPreview('player');
  clearActionPreview('enemy');
}

// バトルフェイズに入った瞬間、数値がまだ確定していなくても「攻撃力」「防御力」のタイトルだけ先に出しておく。
// 実際の数値が決まったら playStatEffect が同じ枠を上書きする。
function showActionTitlePlaceholder(who, kind) {
  const meta = STAT_EFFECT_META[kind];
  const el = document.getElementById(who === 'player' ? 'playerActionTotal' : 'enemyActionTotal');
  const topEl = document.getElementById(who === 'player' ? 'topPlayerActionTotal' : 'topEnemyActionTotal');
  const html = `<span class="action-total-label">${meta.label}</span><span class="action-total-value">—</span>`;

  if (el) {
    const numEl = document.createElement('div');
    numEl.className = `action-total-num action-total-${kind}`;
    numEl.innerHTML = html;
    el.innerHTML = '';
    el.appendChild(numEl);
  }
  if (topEl) {
    const topNumEl = document.createElement('div');
    topNumEl.className = `action-total-num action-total-${kind}`;
    topNumEl.innerHTML = html;
    topEl.innerHTML = '';
    topEl.appendChild(topNumEl);
  }
}

// 固定テキスト演出（BLOCK/NULLIFY/即死など）。中央のカード詳細パネルを一時的に借りて表示する。
function playTextOnlyEffect(who, text, kind, onDone) {
  const panel = document.getElementById('cardDetailStatEffect');
  const placeholder = document.getElementById('cardDetailPlaceholder');
  const content = document.getElementById('cardDetailContent');
  const html = `<span class="cd-stateffect-who">${who === 'player' ? 'あなた' : '影'}</span><span class="action-total-value">${text}</span>`;

  isCardDetailStatEffectBusy = true; // 演出が終わるまで、ホバーによる詳細表示の切り替えを無視する
  if (panel) {
    panel.className = `card-detail-stateffect action-total-${kind}`;
    panel.innerHTML = html;
    panel.style.display = 'flex';
  }
  if (placeholder) placeholder.style.display = 'none';
  if (content) content.style.display = 'none';

  const holdDuration = ANIM.statEffect.holdTextOnly;
  setTimeout(() => {
    onDone();
    if (panel) panel.style.display = 'none';
    isCardDetailStatEffectBusy = false; // 演出終了。ここでホバー詳細表示を再び受け付けるようにする
    showCardDetail(null); // 元のプレースホルダー表示に戻す
  }, holdDuration);
}

// 1件分の数値演出。
// persistent（攻撃力予告・防御力）は行動数値枠に出して消さずに残す。
// それ以外（消費・ダメージ・回復・呪い）は中央のカード詳細パネルを借りて、表示→静止→消える、を行う。
// onSettle は「カウントアップ＋静止」が終わった直後（消える前）に呼ばれる。
function playStatEffect(who, kind, amount, onSettle) {
  const meta = STAT_EFFECT_META[kind];
  const isPersistent = !!meta.persistent;

  let valueEl, topValueEl, panel, placeholder, content;

  if (isPersistent) {
    const el = document.getElementById(who === 'player' ? 'playerActionTotal' : 'enemyActionTotal');
    const topEl = document.getElementById(who === 'player' ? 'topPlayerActionTotal' : 'topEnemyActionTotal');
    const html = `<span class="action-total-label">${meta.label}</span><span class="action-total-value">${meta.sign}${meta.unit}0${meta.suffix || ''}</span>`;

    const numEl = document.createElement('div');
    numEl.className = `action-total-num action-total-${kind}`;
    numEl.innerHTML = html;
    if (el) { el.innerHTML = ''; el.appendChild(numEl); }
    valueEl = numEl.querySelector('.action-total-value');

    if (topEl) {
      const topNumEl = document.createElement('div');
      topNumEl.className = `action-total-num action-total-${kind}`;
      topNumEl.innerHTML = html;
      topEl.innerHTML = '';
      topEl.appendChild(topNumEl);
      topValueEl = topNumEl.querySelector('.action-total-value');
    }
  } else {
    panel = document.getElementById('cardDetailStatEffect');
    placeholder = document.getElementById('cardDetailPlaceholder');
    content = document.getElementById('cardDetailContent');
    const html = `<span class="cd-stateffect-who">${who === 'player' ? 'あなた' : '影'}</span><span class="action-total-label">${meta.label}</span><span class="action-total-value">${meta.sign}${meta.unit}0${meta.suffix || ''}</span>`;

    isCardDetailStatEffectBusy = true; // 演出が終わるまで、ホバーによる詳細表示の切り替えを無視する
    if (panel) {
      panel.className = `card-detail-stateffect action-total-${kind}`;
      panel.innerHTML = html;
      panel.style.display = 'flex';
      valueEl = panel.querySelector('.action-total-value');
    }
    if (placeholder) placeholder.style.display = 'none';
    if (content) content.style.display = 'none';
  }

  const countDuration = ANIM.statEffect.countUp;
  const holdDuration = ANIM.statEffect.hold;

  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / countDuration);
    const eased = 1 - Math.pow(1 - t, 3);
    const current = Math.round(amount * eased);
    if (valueEl) valueEl.textContent = `${meta.sign}${meta.unit}${current}${meta.suffix || ''}`;
    if (topValueEl) topValueEl.textContent = `${meta.sign}${meta.unit}${current}${meta.suffix || ''}`;
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      if (valueEl) valueEl.textContent = `${meta.sign}${meta.unit}${amount}${meta.suffix || ''}`;
      if (topValueEl) topValueEl.textContent = `${meta.sign}${meta.unit}${amount}${meta.suffix || ''}`;
      if (isPersistent) {
        // persistent は表示を消さずに残すが、カウントアップをちゃんと見せる分だけ静止時間は確保する
        setTimeout(onSettle, holdDuration);
        return;
      }
      // カウントアップ完了 →（静止）→ 実際の値へ反映 → 表示を消して元のホバー詳細表示に戻す
      setTimeout(() => {
        onSettle();
        if (panel) panel.style.display = 'none';
        isCardDetailStatEffectBusy = false; // 演出終了。ここでホバー詳細表示を再び受け付けるようにする
        showCardDetail(null);
      }, holdDuration);
    }
  }
  requestAnimationFrame(tick);
}

// 数値ではなく固定テキスト（"BLOCK" "NULLIFY" "即死" など）を、中央のカード詳細パネルに一定時間だけ表示する。
// カウントアップ演出はせず、そのまま表示→静止→消える、というシンプルな流れ。他の増減演出とキューを共有する。
function showActionTextOnly(who, text, kind) {
  statEffectQueue.push({ who, kind, amount: null, applyFn: null, text });
  if (!statEffectRunning) processStatEffectQueue();
}

function openBattleShowcase() {
  const normalMode = document.getElementById('handModeNormal');
  const battleMode = document.getElementById('handModeBattle');
  if (battleMode.style.display === 'none') {
    // 新しい戦闘の演出を始める前に、前回の残り演出をクリアしておく
    document.getElementById('playerActionCards').innerHTML = '';
    document.getElementById('enemyActionCards').innerHTML = '';
    clearAllActionPreviews();
  }
  normalMode.style.display = 'none';
  battleMode.style.display = 'block';
}

function closeBattleShowcase() {
  const normalMode = document.getElementById('handModeNormal');
  const battleMode = document.getElementById('handModeBattle');
  const playerCards = document.getElementById('playerActionCards');
  const enemyCards = document.getElementById('enemyActionCards');
  // バトル演出エリアからカードがふわっと消えたら、元の手札一覧表示に戻す
  playerCards.querySelectorAll('.battle-flash-card').forEach(el => el.classList.add('is-leaving'));
  enemyCards.querySelectorAll('.battle-flash-card').forEach(el => el.classList.add('is-leaving'));
  setTimeout(() => {
    playerCards.innerHTML = '';
    enemyCards.innerHTML = '';
    clearAllActionPreviews();
    battleMode.style.display = 'none';
    // このタイミングで既に手札整理フェイズに入っている場合は、通常デッキ表示を復活させない
    // （手札整理フェイズ側が表示を管理しているので、ここで上書きすると二重表示になってしまう）
    if (!state.pendingDiscard) {
      normalMode.style.display = 'block';
    }
    clearActionIndicators();
  }, ANIM.battle.battleShowcaseClose);
}

// 攻撃・防御カードの登場演出。デッキ一覧のカードと同じ見た目（サイズ・内容）で表示する。
function showAttackFlash(who, card, forceKind) {
  const layer = document.getElementById(who === 'player' ? 'playerActionCards' : 'enemyActionCards');
  if (!layer) return null;
  const el = document.createElement('div');
  const kind = forceKind || (card.type === 'armor' ? '防' : '攻');
  const isAttackCard = kind === '攻';
  const asDefense = kind === '防';
  // 攻撃カードは相手側へシュッと移動しながら登場する演出。防御カードはその場にしっかり構える演出。
  const slideDir = who === 'player' ? 'slide-right' : 'slide-left';
  el.className = `card card-simplified type-${card.type} battle-flash-card ${isAttackCard ? 'is-attack-slide ' + slideDir : 'is-defense-set'} ${card.legend ? 'is-legend':''} ${bcCardClass(card)} ${itemCardClass(card)}`;
  el.innerHTML = `
    <div class="card-type-bar"></div>
    ${cardArtHtml(card)}
    ${legendSparkleHtml(card)}
    ${bcWatermarkHtml(card)}
    ${instantIconHtml(card)}
    ${cardTopLeftAttrHtml(card)}
    <div class="card-face">
      ${powerBadgeHtml(card, asDefense)}
    </div>
    ${cardNameFooterHtml(card)}
  `;
  layer.appendChild(el);
  // ダメージ演出が終わるまでは消さない。モーダルを閉じる際にまとめてクリアする（closeBattleShowcase参照）
  return el;
}

// 攻撃時に追加したPLUSカードも、攻撃カードと同じレイヤーに少し遅れて表示する
function showPlusCardsFlash(who, plusCards) {
  if (!plusCards || plusCards.length === 0) return;
  const layer = document.getElementById(who === 'player' ? 'playerActionCards' : 'enemyActionCards');
  if (!layer) return;
  plusCards.forEach(card => {
    const el = document.createElement('div');
    const slideDir = who === 'player' ? 'slide-right' : 'slide-left';
    el.className = `card card-simplified type-${card.type} battle-flash-card is-attack-slide ${slideDir} ${card.legend ? 'is-legend':''} ${bcCardClass(card)} ${itemCardClass(card)}`;
    el.innerHTML = `
      <div class="card-type-bar"></div>
      ${cardArtHtml(card)}
      ${legendSparkleHtml(card)}
      ${bcWatermarkHtml(card)}
      ${instantIconHtml(card)}
      ${cardTopLeftAttrHtml(card)}
      <div class="card-face">
        ${powerBadgeHtml(card)}
      </div>
      ${cardNameFooterHtml(card)}
    `;
    layer.appendChild(el);
  });
}

// 回復アイテムの演出：自分側の領域にカードを表示 →(0.5秒)→ 拡大しながらフェードアウト＋回復エフェクト
// こちらもデッキ一覧のカードと同じ見た目で表示する。
function showHealFlash(who, card) {
  const layer = document.getElementById(who === 'player' ? 'playerActionCards' : 'enemyActionCards');
  if (!layer) return null;
  const el = document.createElement('div');
  el.className = `card card-simplified type-${card.type} battle-flash-card is-heal-set ${card.legend ? 'is-legend':''} ${bcCardClass(card)} ${itemCardClass(card)}`;
  el.innerHTML = `
    <div class="card-type-bar"></div>
    ${cardArtHtml(card)}
    ${bcWatermarkHtml(card)}
    ${instantIconHtml(card)}
    <div class="card-face">
      ${powerBadgeHtml(card)}
    </div>
    ${cardNameFooterHtml(card)}
  `;
  layer.appendChild(el);
  return el;
}

function flashPanelEffect(who, cls) {
  const panel = document.getElementById(who === 'player' ? 'playerPanel' : 'enemyPanel');
  if (!panel) return;
  panel.classList.remove(cls);
  void panel.offsetWidth; // reflow で再トリガー可能に
  panel.classList.add(cls);
  setTimeout(() => panel.classList.remove(cls), ANIM.cardFlash.panelPulse);
}

// 現在どちらが攻撃/防御しているかをパネルの辺に矢印で示す。
// 攻撃側パネルの右辺に「＞」、防御側パネルの左辺に「＜」を出す。
function showActionIndicator(attackerKey, defenderKey) {
  clearActionIndicators();
  const attackerPanel = document.getElementById(attackerKey === 'player' ? 'playerPanel' : 'enemyPanel');
  const defenderPanel = document.getElementById(defenderKey === 'player' ? 'playerPanel' : 'enemyPanel');
  if (attackerPanel) {
    attackerPanel.classList.add('is-attacking-side');
    const arrow = document.createElement('span');
    arrow.className = 'action-side-arrow arrow-attack';
    arrow.textContent = '＞';
    attackerPanel.appendChild(arrow);
  }
  if (defenderPanel) {
    defenderPanel.classList.add('is-defending-side');
    const arrow = document.createElement('span');
    arrow.className = 'action-side-arrow arrow-defend';
    arrow.textContent = '＜';
    defenderPanel.appendChild(arrow);
  }
}

function clearActionIndicators() {
  const playerPanel = document.getElementById('playerPanel');
  const enemyPanel = document.getElementById('enemyPanel');
  [playerPanel, enemyPanel].forEach(panel => {
    if (!panel) return;
    panel.classList.remove('is-attacking-side', 'is-defending-side');
    panel.querySelectorAll('.action-side-arrow').forEach(el => el.remove());
  });
}

// 完全ブロック時：攻撃カードが「カキーン」と弾かれて戻る演出
function playBlockedBounce(attackerKey) {
  const layer = document.getElementById(attackerKey === 'player' ? 'playerActionCards' : 'enemyActionCards');
  if (!layer) return;
  const atkCard = layer.querySelector('.battle-flash-card.is-attack-slide');
  if (!atkCard) return;
  atkCard.classList.add('is-bounced');
}

// ダメージが確定した瞬間、攻撃カードに「一撃を放った」ような軽いヒット演出を加える
function playAttackHitPulse(attackerKey) {
  const layer = document.getElementById(attackerKey === 'player' ? 'playerActionCards' : 'enemyActionCards');
  if (!layer) return;
  const atkCard = layer.querySelector('.battle-flash-card.is-attack-slide');
  if (!atkCard) return;
  atkCard.classList.add('is-hit-pulse');
}
