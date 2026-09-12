/* ============================================================
   game-core.js — ゲーム全体の状態管理・進行担当ファイル

   ここには「今の試合の状態（state）」「カードを使った時の
   共通処理」「手札一覧の描画」「ターンの進み方」「ゲームの
   開始・終了」など、ゲーム全体を貫く「本体」の部分がまとまっている。

   新しいカード効果を追加したい、ゲーム開始時の初期値を変えたい、
   ターンがどう進むか変えたい、という時はまずここを開く。

   このファイルは他の全てのファイル（card-rules.js, anim-config.js,
   stat-effects.js, card-view.js, battle.js, discard.js）より
   後、一番最後に読み込む必要がある。ファイルの一番下で
   startGame() を呼んでゲームを開始しているのもこのファイル。
   ============================================================ */


let state = null;

// state.actionLocked の安全装置。タブが非アクティブになると setTimeout や
// requestAnimationFrame が遅延・停止することがあり、演出の途中で止まってしまうと
// ロックが解除されないままゲームが進まなくなってしまう。それを防ぐため、
// ロックした瞬間に「一定時間後、まだロックされたままなら強制解除する」タイマーを必ずセットする。
const ACTION_LOCK_TIMEOUT_MS = 8000;
let actionLockTimeoutId = null;
function lockAction() {
  state.actionLocked = true;
  if (actionLockTimeoutId) clearTimeout(actionLockTimeoutId);
  actionLockTimeoutId = setTimeout(() => {
    if (state.actionLocked) {
      console.warn('演出が完了しないまま時間切れになったため、操作ロックを強制解除しました');
      state.actionLocked = false;
      render();
    }
    actionLockTimeoutId = null;
  }, ACTION_LOCK_TIMEOUT_MS);
}
function unlockAction() {
  state.actionLocked = false;
  if (actionLockTimeoutId) {
    clearTimeout(actionLockTimeoutId);
    actionLockTimeoutId = null;
  }
}

// タブがバックグラウンドの間は setTimeout 自体の発火も大幅に遅延・停止することがあるため、
// 8秒の安全装置だけでは足りない場合がある。タブが再びアクティブになった瞬間（visibilitychange）にも、
// ロックが残っていないか・演出キューが止まっていないかをチェックし、残っていれば即座に復旧させる。
// ただし「一瞬タブを離れてすぐ戻ってきた」だけの正常な演出中まで巻き込んで解除しないよう、
// 実際に一定時間（1秒）以上バックグラウンドだった場合だけ復旧処理を行う。
let hiddenSinceMs = null;
const VISIBILITY_RECOVERY_THRESHOLD_MS = 1000;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    hiddenSinceMs = Date.now();
    return;
  }
  if (!state || hiddenSinceMs === null) return;
  const hiddenDuration = Date.now() - hiddenSinceMs;
  hiddenSinceMs = null;
  if (hiddenDuration < VISIBILITY_RECOVERY_THRESHOLD_MS) return; // 短い切り替えは正常な演出中の可能性があるので何もしない

  if (state.actionLocked) {
    console.warn('タブ復帰時に操作ロックが残っていたため、強制解除しました');
    unlockAction();
    render();
  }
  if (typeof forceResetStatEffectQueueIfStuck === 'function') {
    forceResetStatEffectQueueIfStuck();
  }
});

function initState() {
  return {
    turn: "player",
    over: false,
    player: { hp:100, mp:50, money:50, hand:[], dodge:false, shield:0, statuses:[], lastHit: null, nextDefenseReduction: 0, pendingRefill: 0 },
    enemy:  { hp:100, mp:50, money:50, hand:[], dodge:false, shield:0, statuses:[], lastHit: null, nextDefenseReduction: 0, pendingRefill: 0 },
    pendingDefense: null, // { attacker, defenderKey, card }
    pendingAttack: null, // { who, oppKey, attackIdx, card, plusIdxs: [] } 攻撃カード選択後〜攻撃開始ボタンを押すまでの準備状態
    pendingDiscard: null, // { who, discardIdxs: [] } ターン開始時の「不要カード最大3枚を捨てて、消費分と合わせて授かる」フェイズの状態
    newCardUids: new Set(),
    pinnedDetailArt: null, // 攻撃フェイズ開始〜バトル終了まで、上段中央パネルの背景に固定表示し続ける絵のURL
    actionLocked: false, // 回復演出などの最中で、まだターン交代前だが他のカードを選べないようにする一時ロック
  };
}

function recordHit(defenderKey, card, resultText) {
  state[defenderKey].lastHit = { cardName: card.name, myth: card.myth, attr: card.attr, resultText };
}

/* ===================== 汎用コスト処理（cost: {hp, mp, money}） ===================== */
function canPayCost(entity, card) {
  if (!card.cost) return true;
  const c = card.cost;
  if (c.hp && entity.hp <= c.hp) return false; // HPコストで即死するカードは使用不可（自滅防止）
  if (c.mp && entity.mp < c.mp) return false;
  if (c.money && entity.money < c.money) return false;
  return true;
}

function payCost(who, entity, card) {
  if (!card.cost) return;
  const c = card.cost;
  const label = who === 'player' ? 'あなた' : '影';
  if (c.hp) {
    entity.hp = Math.max(0, entity.hp - c.hp);
    addLog(`${label}は「${card.name}」のコストとしてHP${c.hp}を支払った`, 'hit');
    queueStatEffect(who, 'cost-hp', c.hp);
  }
  if (c.mp) {
    entity.mp = Math.max(0, entity.mp - c.mp);
    addLog(`${label}は「${card.name}」のコストとしてMP${c.mp}を支払った`, 'system');
    queueStatEffect(who, 'cost-mp', c.mp);
  }
  if (c.money) {
    entity.money = Math.max(0, entity.money - c.money);
    addLog(`${label}は「${card.name}」のコストとして${c.money}Gを支払った`, 'system');
    queueStatEffect(who, 'cost-money', c.money);
  }
}

/* ===================== tags による即時効果処理 ===================== */
// instant: true のカードや、その場で完結する効果を tags で処理する。
// 対応済みタグ:
//   "shield3" 等 "shieldN" : 合計 N ダメージ分を防ぐ「加護」を得る。1回限りではなく、
//     使い切るまで何ターンでも持続する（複数回に分けて消費されてもよい）
function applyTagEffects(who, entity, card) {
  if (!card.tags) return;
  const label = who === 'player' ? 'あなた' : '影';
  card.tags.forEach(tag => {
    const shieldMatch = /^shield(\d+)$/.exec(tag);
    if (shieldMatch) {
      const amount = parseInt(shieldMatch[1]);
      entity.nextDefenseReduction += amount;
      addLog(`${label}は「${card.name}」で合計${amount}ダメージ分を防ぐ加護を得た（使い切るまで持続）`, 'system');
      queueStatEffect(who, 'guard', amount);
      playHealSparkle(who, 'guard');
    }
  });
}

// instant: true のカード専用の効果適用（ターンを消費しない）
function applyInstantEffect(who, self, opp, card) {
  const label = who === 'player' ? 'あなた' : '影';
  applyTagEffects(who, self, card);

  const h = card.heal || {};
  if (h.hp) { self.hp += h.hp; queueStatEffect(who, 'heal-hp', h.hp); }
  if (h.mp) { self.mp += h.mp; queueStatEffect(who, 'heal-mp', h.mp); }
  if (h.shield) { self.shield += h.shield; }
  if (h.cure) { cureAllStatuses(self); }
  if (h.hp || h.mp || h.shield || h.cure) {
    flashPanelEffect(who, 'heal-effect');
    playHealSparkle(who);
  }

  addLog(`${label}は「${card.name}」を発動した（ターン消費なし）${card.effect ? '：' + card.effect : ''}`, 'system');
}

function fillHand(entity, n=20, trackNew=false) {
  const newUids = [];
  while (entity.hand.length < n) {
    const c = drawCard();
    entity.hand.push(c);
    newUids.push(c._uid);
  }
  if (trackNew) state.newCardUids = new Set(newUids);
}

// ログシステムは廃止済み。呼び出し箇所は残っているが、ここで何もしない実装にすることで無害化している。
function addLog(msg, cls="") {}

function render() {
  const p = state.player, e = state.enemy;

  animateNumber('playerHpText', displayedStats.player.hp, p.hp);
  animateNumber('playerMpText', displayedStats.player.mp, p.mp);
  document.getElementById('playerMoneyText').innerHTML = `${p.money}<span class="unit">G</span>`;
  animateNumber('playerGuardText', displayedStats.player.guard, p.nextDefenseReduction || 0);

  animateNumber('enemyHpText', displayedStats.enemy.hp, e.hp);
  animateNumber('enemyMpText', displayedStats.enemy.mp, e.mp);
  document.getElementById('enemyMoneyText').innerHTML = `${e.money}<span class="unit">G</span>`;
  animateNumber('enemyGuardText', displayedStats.enemy.guard, e.nextDefenseReduction || 0);

  displayedStats.player.hp = p.hp;
  displayedStats.player.mp = p.mp;
  displayedStats.player.guard = p.nextDefenseReduction || 0;
  displayedStats.enemy.hp = e.hp;
  displayedStats.enemy.mp = e.mp;
  displayedStats.enemy.guard = e.nextDefenseReduction || 0;

  renderStatus('playerStatus', p);
  renderStatus('enemyStatus', e);

  // 今どちらのターンかを、ステータス枠の発光で表現する
  document.getElementById('playerPanel').classList.toggle('is-active-turn', state.turn === 'player');
  document.getElementById('enemyPanel').classList.toggle('is-active-turn', state.turn === 'enemy');

  renderHand();
}

function renderHand() {
  const grid = document.getElementById('handGrid');
  const p = state.player;

  updateSummonBtn();

  // 攻撃準備フェイズ中（PLUSカード選択画面）は、選んだ攻撃カードを手札から取り除いたままにせず、
  // 見た目上は手札に残ったまま「選択中」として見せる。実際に手札から消えるのは
  // 「攻撃開始」ボタンを押した瞬間（resolveAttack が呼ばれる時）にする。
  const pendingCard = (state.pendingAttack && state.pendingAttack.who === 'player') ? state.pendingAttack.card : null;
  const handForDisplay = pendingCard ? [pendingCard, ...p.hand] : p.hand;

  if (handForDisplay.length === 0) {
    grid.innerHTML = `<div class="empty-hand">手札がありません</div>`;
    return;
  }

  const withIdx = handForDisplay.map((c, idx) => ({ c, idx }));

  // 種別（武器→防具→アイテム→その他）→種別内の数値順で並べる
  const items = withIdx.slice().sort((a, b) => compareHandCards(a.c, b.c));

  grid.innerHTML = items.map(({c, idx}) => {
    const isPendingCard = pendingCard && c === pendingCard;
    // 呪い状態だと回復カード（HP/MP回復を持つitem。instant回復も含む）は使用不可。
    // ただし状態異常回復系（heal.cure）は例外で使える。playCard側の判定と揃えてある。
    const wouldHeal = (c.buyEffect && (c.buyEffect.hp || c.buyEffect.mp)) || (c.heal && (c.heal.hp || c.heal.mp));
    const isCureCard = c.heal && c.heal.cure;
    const blockedByCurse = c.type === 'item' && hasStatus(p, 'curse') && wouldHeal && !isCureCard;
    const disabled = isPendingCard || state.turn !== 'player' || state.over || state.pendingDefense || state.pendingAttack || state.pendingDiscard || state.actionLocked || c.type === 'armor' || blockedByCurse
      || (c.type==='miracle' && c.cost > p.mp)
      || (c.buyEffect && p.money < c.buyEffect.cost)
      || (typeof c.castCostHp === 'number' && c.castCostHp >= p.hp) // HP代償で自滅するカードは使用不可
      || (typeof c.castCostMp === 'number' && c.castCostMp > p.mp)
      || (typeof c.castCostMoney === 'number' && c.castCostMoney > p.money);
    const isNew = state.newCardUids && state.newCardUids.has(c._uid);
    // フェードイン演出（is-new-appear）は、このカードでまだ一度も再生していない時だけ付ける。
    // 一度描画したら即座に「再生済み」として記録するので、次に render() が呼ばれた時（NEWアイコンは
    // 引き続き表示される間）はフェードインし直さない。
    const isNewAppear = isNew && !newCardAppearPlayed.has(c._uid);
    if (isNewAppear) newCardAppearPlayed.add(c._uid);
    return `
      <div class="card card-simplified type-${c.type} ${disabled ? 'disabled':''} ${isPendingCard ? 'selected':''} ${isNew ? 'is-new':''} ${isNewAppear ? 'is-new-appear':''} ${c.legend ? 'is-legend':''} ${bcCardClass(c)} ${itemCardClass(c)}" data-idx="${isPendingCard ? -1 : idx}"${blockedByCurse ? ' title="呪いで使えない！"' : ''}>
        ${isNew ? '<div class="new-tag">NEW</div>' : ''}
        ${isPendingCard ? '<div class="selected-tag">選択中</div>' : ''}
        <div class="card-type-bar"></div>
        ${cardArtHtml(c)}
        ${legendSparkleHtml(c)}
        ${bcWatermarkHtml(c)}
        ${instantIconHtml(c)}
        ${cardTopLeftAttrHtml(c)}
        ${cardTopRightStatusHtml(c)}
        ${cardNameFooterHtml(c)}
        <div class="card-face">
          ${powerBadgeHtml(c)}
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.card').forEach((el, elIdx) => {
    const c = items[elIdx].c;
    el.addEventListener('mouseenter', () => showCardDetail(c));
    el.addEventListener('mouseleave', () => showCardDetail(null));
    el.addEventListener('touchstart', () => showCardDetail(c), { passive: true });
  });

  grid.querySelectorAll('.card:not(.disabled)').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx);
      playCard('player', idx);
    });
  });
}

function updateSummonBtn() {
  const btn = document.getElementById('summonBtn');
  if (!btn) return;
  const p = state.player;
  const canSummon = state.turn === 'player' && !state.over && !state.pendingDefense && !state.pendingAttack && !state.pendingDiscard && !hasAttackCard(p.hand);
  // display:none で消すと高さ分のスペースごと無くなり、デッキ全体の高さが出入りでガタつくため、
  // visibility で見た目だけ消してスペース（高さ）は常に確保しておく
  const shouldShow = !hasAttackCard(p.hand);
  btn.style.visibility = shouldShow ? 'visible' : 'hidden';
  btn.style.pointerEvents = shouldShow ? 'auto' : 'none';
  btn.disabled = !canSummon;
}

function summonCard() {
  if (state.over || state.turn !== 'player' || state.pendingDefense || state.pendingAttack || state.pendingDiscard) return;
  const p = state.player;
  if (hasAttackCard(p.hand)) return; // 攻撃カードがあれば使用不可
  const newCard = drawCard();
  p.hand.push(newCard);
  state.newCardUids = new Set([newCard._uid]);
  addLog(`あなたは神々に「召喚」を捧げ、「${newCard.name}」を授かった`, 'system');
  state.turn = 'enemy';
  tickStatusesAtTurnStart('enemy', state.enemy);
  render();
  beginTurnStartStep('enemy');
}
document.getElementById('summonBtn').addEventListener('click', summonCard);


/* ===================== ゲームロジック ===================== */
function playCard(who, idx) {
  if (state.over || state.turn !== who || state.pendingAttack || state.pendingDefense || state.pendingDiscard || state.actionLocked) return;
  const self = state[who];
  const opp = who === 'player' ? state.enemy : state.player;
  const oppKey = who === 'player' ? 'enemy' : 'player';
  const card = self.hand[idx];

  const selfLabel = who === 'player' ? 'あなた' : '影';
  const oppLabel = who === 'player' ? '影' : 'あなた';

  // 汎用コスト（cost: {hp, mp, money}）のチェック。武器/防具/雑貨/奇跡すべて対応
  if (card.cost && typeof card.cost === 'object' && !canPayCost(self, card)) {
    addLog(`${selfLabel}は「${card.name}」のコストを支払えない`, 'system');
    render();
    return;
  }

  // 呪い状態だと回復カード（HP/MP回復を持つitem。instant回復も含む）は使用不可。
  // ただし状態異常回復系（heal.cure）は例外で使える。
  const wouldHeal = (card.buyEffect && (card.buyEffect.hp || card.buyEffect.mp)) || (card.heal && (card.heal.hp || card.heal.mp));
  const isCureCard = card.heal && card.heal.cure;
  if (card.type === 'item' && hasStatus(self, 'curse') && wouldHeal && !isCureCard) {
    addLog(`${selfLabel}は呪いにより「${card.name}」を使用できない`, 'system');
    render();
    return;
  }

  self.hand.splice(idx, 1);
  if (who === 'player' && state.newCardUids) state.newCardUids.delete(card._uid);

  // instant: true のカードはターンを消費せず、即座に効果を発動して手番を継続する。
  // ただし攻撃力を持つ武器（例：影手裏剣）は「攻撃系instant」として、通常の攻撃フロー
  // （resolveAttack、ターン消費なし・防御不可）に乗せる。回復・パッシブ系のみここで処理する。
  const isInstantAttack = card.instant && card.type === 'weapon';
  if (card.instant && !isInstantAttack) {
    // 中央パネルがまだホバー詳細を表示している状態のまま数値演出に入ると表示が重なって見えることがあるため、
    // ここで確実にホバー詳細をクリアしてから演出を始める
    showCardDetail(null);
    if (card.cost && typeof card.cost === 'object') payCost(who, self, card);
    if (who === 'player') lockAction(); // 演出が終わるまで、他のカードを選べないようにする
    applyInstantEffect(who, self, opp, card);
    // このカードの補充は即座に行わず、次に自分のターンが開始する時の手札整理フェイズ（捨てる→授かる演出）でまとめて行う
    self.pendingRefill = (self.pendingRefill || 0) + 1;
    render();
    if (who === 'player') {
      onStatEffectQueueEmpty(() => { unlockAction(); render(); });
    }
    return;
  }

  switch (card.type) {
    case 'weapon':
    case 'magic':
    case 'miracle': {
      // 発動コスト（castCostHp/Mp/Money）が足りない場合は不発（自滅防止・MP不足防止）
      if (typeof card.castCostHp === 'number' && card.castCostHp >= self.hp) {
        addLog(`${selfLabel}はHPが足りず「${card.name}」を発動できなかった`, 'system');
        self.hand.splice(0, 0, card); // 使わなかったので手札に戻す
        render();
        return;
      }
      if (typeof card.castCostMp === 'number' && card.castCostMp > self.mp) {
        addLog(`${selfLabel}はMP不足で「${card.name}」を発動できなかった`, 'system');
        self.hand.splice(0, 0, card);
        render();
        return;
      }
      if (typeof card.castCostMoney === 'number' && card.castCostMoney > self.money) {
        addLog(`${selfLabel}は所持金不足で「${card.name}」を発動できなかった`, 'system');
        self.hand.splice(0, 0, card);
        render();
        return;
      }

      if (card.type === 'miracle' && typeof card.cost === 'number') {
        // 旧形式（cost が数値＝MPのみ）との互換
        if (card.cost > self.mp) { addLog(`${selfLabel}はMP不足で${card.name}を発動できなかった`, 'system'); break; }
        if (card.power === undefined) {
          // 攻撃準備フェイズを経由しない、その場で完結するmiracle（steal/curse/dodge等）は
          // ここで即座に消費してよい（キャンセルの余地が無いカードのため）
          self.mp -= card.cost;
          queueStatEffect(who, 'cost-mp', card.cost);
        }
        // power を持つ攻撃系miracleは、コスト消費を resolveAttack 側（実際に攻撃が発動する直前）に
        // 遅らせてある。攻撃準備フェイズでキャンセルすれば一切払わずに済むようにするため。
      } else if (card.cost && typeof card.cost === 'object') {
        payCost(who, self, card);
      }
      applyTagEffects(who, self, card);

      if (card.steal) {
        const stolen = Math.floor(opp.money/2);
        opp.money -= stolen; self.money += stolen;
        addLog(`${selfLabel}は「${card.name}」で${oppLabel}から${stolen}Gを奪った`, 'hit');
        break;
      }
      if (card.curse) {
        inflictRandomStatus(oppKey, opp);
        break;
      }
      if (card.dodge) {
        self.dodge = true;
        addLog(`${selfLabel}は「${card.name}」を発動。次の攻撃を回避態勢に入った`, 'system');
        break;
      }

      // ダメージ系（武器 or 攻撃奇跡）→ 防御フェイズへ
      if (opp.dodge) {
        opp.dodge = false;
        addLog(`${oppLabel}は「${card.name}」を華麗に回避した！`, 'system');
        break;
      }

      if (who === 'player' && !isInstantAttack && self.hand.some(isPlusCard)) {
        // プレイヤーの攻撃は「攻撃準備フェイズ」に入る：PLUSカードを追加選択し、
        // 攻撃開始ボタンを押すまでは攻撃が発動しない
        // （instant攻撃カードや、PLUSカードを1枚も持っていない場合はこの準備フェイズをスキップして即座に発動する）
        state.pendingAttack = { who, oppKey, card, plusIdxs: [] };
        // 攻撃準備フェイズ（PLUSカード選択画面）が開くこの瞬間から、背景を攻撃カードの絵に固定する
        pinDetailArt(card);
        render();
        openAttackPrepModal();
        return;
      }

      // CPU（影）、instant攻撃カード、またはPLUSカードを持っていない場合はそのまま即座に攻撃を発動する
      resolveAttack(who, oppKey, card);
      return; // resolveAttack内でターン進行まで処理するのでここで終了
    }

    case 'armor': {
      // 防具は自ターンでは使用不可（防御フェイズでのみ使用）。ここには通常来ない。
      self.hand.splice(0, 0, card); // 誤って消費されないよう手札に戻す
      addLog(`${selfLabel}は「${card.name}」を今は使えない（防御フェイズでのみ使用可）`, 'system');
      render();
      return;
    }

    case 'item': {
      if (card.buyEffect) {
        const b = card.buyEffect;
        if (self.money < b.cost) {
          self.hand.splice(0, 0, card); // お金不足で使用不可、手札に戻す
          addLog(`${selfLabel}は「${card.name}」を買うお金が足りない（必要${b.cost}G）`, 'system');
          render();
          return;
        }
        self.money -= b.cost;
        playHealSequence(who, oppKey, card, { hp: b.hp, mp: b.mp }, `${selfLabel}は${b.cost}Gで「${card.name}」を購入・使用した（${card.effect}）`);
        return;
      }
      if (card.cost && typeof card.cost === 'object') payCost(who, self, card);
      applyTagEffects(who, self, card);
      const h = card.heal || {};
      if (h.shield) { self.shield += h.shield; }
      if (h.cure) { cureAllStatuses(self); }
      playHealSequence(who, oppKey, card, { hp: h.hp, mp: h.mp }, `${selfLabel}は「${card.name}」を使用した（${card.effect}）`);
      return;
    }

    case 'trade': {
      // 簡易両替：HP2をMP2に変換（デモ用の固定挙動）
      if (self.hp > 2) {
        self.hp -= 2; self.mp += 2;
        addLog(`${selfLabel}は「両替」でHP2をMP2に変換した`, 'system');
      } else {
        addLog(`${selfLabel}は「両替」を試みたが変換元が不足していた`, 'system');
      }
      break;
    }
  }

  endTurnAfterCard(who, oppKey);
}

function endTurnAfterCard(who, oppKey) {
  const self = state[who];
  checkGameOver();
  if (state.over) { render(); return; }

  // このカードの補充は即座に行わず、次に自分のターンが来た時の手札整理フェイズ（捨てる→授かる演出）でまとめて行う
  self.pendingRefill = (self.pendingRefill || 0) + 1;
  state.turn = oppKey;
  tickStatusesAtTurnStart(oppKey, state[oppKey]);
  render();

  beginTurnStartStep(oppKey);
}

document.getElementById('startAttackBtn').addEventListener('click', () => {
  if (!state.pendingAttack) return;
  const { who, oppKey, card, plusIdxs } = state.pendingAttack;
  const self = state[who];

  // 選択したPLUSカードを手札から取り除き、合計ボーナスを計算する
  const idxs = plusIdxs.slice().sort((a,b) => b-a);
  let totalPlusBonus = 0;
  const usedPlusCards = [];
  idxs.forEach(i => {
    const plusCard = self.hand[i];
    totalPlusBonus += plusCard.plusBonus;
    usedPlusCards.push(plusCard);
    self.hand.splice(i, 1);
  });

  // 攻撃カードの手札インデックスは既に確定しているカードオブジェクトを使うので探し直す必要はない
  const attackCard = totalPlusBonus > 0 ? { ...card, plus: (card.plus || 0) + totalPlusBonus } : card;

  if (usedPlusCards.length > 0) {
    const selfLabel = who === 'player' ? 'あなた' : '影';
    const namesText = usedPlusCards.map(c => `「${c.name}」`).join('+');
    addLog(`${selfLabel}は${namesText}を追加し、攻撃力+${totalPlusBonus}で攻撃準備を整えた`, 'system');
  }

  state.pendingAttack = null;
  render(); // 選択中だった攻撃カードの見た目（selected表示）を消すため、ここで一度手札を再描画しておく
  closeAttackPrepModal();
  resolveAttack(who, oppKey, attackCard, false, usedPlusCards.length, usedPlusCards);
});

document.getElementById('cancelAttackBtn').addEventListener('click', () => {
  if (!state.pendingAttack) return;
  const { who, card } = state.pendingAttack;
  const self = state[who];
  // 攻撃カードを手札に戻す（PLUSカードは選択していただけで手札からまだ取り除いていないのでそのまま）
  self.hand.splice(0, 0, card);
  const selfLabel = who === 'player' ? 'あなた' : '影';
  addLog(`${selfLabel}は「${card.name}」の使用を取りやめた`, 'system');
  state.pendingAttack = null;
  unpinDetailArt(); // 攻撃自体を取りやめたので、背景固定も解除する
  closeAttackPrepModal(true);
  render();
});

function enemyTurn() {
  if (state.over) return;
  beginTurnStartStep('enemy');
}

// 敵のターン開始時の手札整理演出が終わった後に呼ばれる、実際のカード選択・使用処理
function enemyTurnAct() {
  if (state.over) return;
  const self = state.enemy;
  fillHand(self);

  if (!hasAttackCard(self.hand)) {
    // 攻撃カードが無ければ影も「召喚」を行う
    const newCard = drawCard();
    self.hand.push(newCard);
    addLog(`影は神々に「召喚」を捧げ、「${newCard.name}」を授かった`, 'system');
    state.turn = 'player';
    tickStatusesAtTurnStart('player', state.player);
    render();
    beginTurnStartStep('player');
    return;
  }

  // 簡易CPU: HP低ければ雑貨優先、MP足りてれば奇跡、なければ武器、なければ防具、なければ取引
  let idx = -1;
  const lowHp = self.hp <= 30;

  if (lowHp) idx = self.hand.findIndex(c => c.type === 'item' && c.heal && c.heal.hp);
  if (idx === -1) idx = self.hand.findIndex(c => c.type === 'weapon');
  if (idx === -1) idx = self.hand.findIndex(c => c.type === 'magic' && typeof c.castCostMp === 'number' && c.castCostMp <= self.mp);
  if (idx === -1) idx = self.hand.findIndex(c => c.type === 'miracle' && c.cost <= self.mp && !c.dodge);
  if (idx === -1) idx = self.hand.findIndex(c => c.type === 'item');
  if (idx === -1) idx = self.hand.findIndex(c => c.type === 'armor');
  if (idx === -1) idx = 0;

  playCard('enemy', idx);
}

function checkGameOver() {
  if (state.player.hp <= 0) { state.over = true; showOverlay(false); }
  else if (state.enemy.hp <= 0) { state.over = true; showOverlay(true); }
}

function showOverlay(playerWon) {
  addLog(playerWon ? 'あなたは影を打ち破った！' : 'あなたは力尽きた…', 'death');
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlayTitle');
  title.textContent = playerWon ? '勝 利' : '敗 北';
  title.className = 'overlay-title ' + (playerWon ? 'win' : 'lose');

  const causeEl = document.getElementById('overlayCause');
  const loser = playerWon ? state.enemy : state.player;
  if (loser.lastHit) {
    const h = loser.lastHit;
    causeEl.innerHTML = `${h.myth ? h.myth + '・' : ''}「${h.cardName}」による${h.resultText}`;
    causeEl.style.display = 'block';
  } else {
    causeEl.style.display = 'none';
  }

  overlay.classList.add('show');
}

function startGame() {
  state = initState();
  displayedStats = { player: { hp: null, mp: null, guard: null }, enemy: { hp: null, mp: null, guard: null } };
  newCardAppearPlayed.clear();
  fillHand(state.player);
  fillHand(state.enemy);
  addLog('神々の戦場に降り立った。手札から神器を選び使用せよ。', 'system');
  document.getElementById('overlay').classList.remove('show');
  render();
}

document.getElementById('overlayRestart').addEventListener('click', startGame);

// ===== 固定レイアウト＋スケール方式 =====
// ゲーム画面は 1400x788（16:9）の固定サイズで作ってあり、実際のウィンドウに合わせて
// transform: scale() で拡大縮小するだけにする。これにより、中のCSSは「画面幅が
// 変わったら崩れる」ことを考えずに、常にこの基準サイズの中の絶対値で組める。
// 考え方は「アスペクト比を保ったまま最大表示する（Aspect Fit / Letterboxing）」という、
// 昔からゲームでよく使われる定番の手法。
const GAME_STAGE_WIDTH = 1680; // 1400（既存のボード）+ 280（左サイドの詳細パネル）
const GAME_STAGE_HEIGHT = 788;
function syncGameScale() {
  const stage = document.getElementById('gameStage');
  if (!stage) return;
  // 横幅を基準にした時の倍率、縦幅を基準にした時の倍率をそれぞれ計算し、
  // 小さい方（＝画面からはみ出さない方）を採用する
  const scaleX = window.innerWidth / GAME_STAGE_WIDTH;
  const scaleY = window.innerHeight / GAME_STAGE_HEIGHT;
  const scale = Math.min(scaleX, scaleY);
  stage.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', syncGameScale);
syncGameScale();

startGame();