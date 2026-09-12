/* ============================================================
   discard.js — 手札整理・授かり演出担当ファイル

   ここには「ターン開始時に不要札を最大3枚まで捨てて、
   新しいカードを授かる」一連の演出・ロジックがまとまっている。
   捨てるカードの選び方（CPU判断含む）、捨てる→授かるの
   画面切り替え、フェードイン・フェードアウトの制御など。

   「手札整理の見た目やスピードを変えたい」という時はここを開く。

   このファイルは card-rules.js, anim-config.js, stat-effects.js,
   card-view.js より後に読み込む必要がある。
   ============================================================ */


function beginTurnStartStep(who) {
  if (state.over) return;
  const self = state[who];

  if (who === 'player') {
    state.pendingDiscard = { who, discardIdxs: [] };
    openDiscardModal();
  } else {
    // 敵のターン開始時は、手札が見えてしまう画面を一切表示せず、演出もカットして即座に処理する
    // （相手の手札が見えるのを防ぐ、かつテンポも良くなる）
    resolveEnemyTurnStartInstantly();
  }
}

// 敵のターン開始時の手札整理を、画面・演出なしで即座に済ませる。
// 捨てるカードを選び、消費した分と合わせてまとめて補充してから、そのまま行動へ進む。
function resolveEnemyTurnStartInstantly() {
  const self = state.enemy;
  const idxs = pickCpuDiscardIdxs(self.hand, self);
  const pendingRefill = self.pendingRefill || 0;
  self.pendingRefill = 0;

  const sortedIdxs = idxs.slice().sort((a,b) => b-a); // 降順でspliceしないとズレる
  sortedIdxs.forEach(i => self.hand.splice(i, 1));

  const totalDraw = idxs.length + pendingRefill;
  for (let n = 0; n < totalDraw; n++) {
    self.hand.push(drawCard());
  }

  render();
  enemyTurnAct();
}

// 選択が確定した後の共通処理：中央オーバーレイで「捨てる→（同じ場所で）授かる」を連続して見せ、
// 終わったら通常表示に戻して、who の実際のターン行動へ進む。
// （プレイヤー専用。敵は resolveEnemyTurnStartInstantly で処理するのでここは通らない）
function proceedDiscardConfirm() {
  const { who, discardIdxs } = state.pendingDiscard;
  const self = state[who];
  const pendingRefill = self.pendingRefill || 0;
  self.pendingRefill = 0; // ここで消化するのでリセットしておく

  if (discardIdxs.length === 0 && pendingRefill === 0) {
    // 捨てるカードも、消費した補充分も無ければ、そのまま通常表示に戻る
    closeDiscardModal();
    state.pendingDiscard = null;
    render();
    return;
  }

  const sortedIdxs = discardIdxs.slice().sort((a,b) => b-a); // 降順でspliceしないとズレる
  const discardedCards = sortedIdxs.map(i => self.hand[i]);

  const swapFn = () => {
    // 実際に手札から取り除く
    sortedIdxs.forEach(i => self.hand.splice(i, 1));
    // 捨てた枚数分 ＋ 今ターンで消費して未補充だった枚数分をまとめて引く
    const totalDraw = discardedCards.length + pendingRefill;
    const newCards = [];
    for (let n = 0; n < totalDraw; n++) {
      const c = drawCard();
      self.hand.push(c);
      newCards.push(c);
    }
    state.newCardUids = new Set(newCards.map(c => c._uid));
    return newCards;
  };

  const onAllDone = () => {
    closeDiscardModal();
    state.pendingDiscard = null;
    render();
  };

  if (discardIdxs.length === 0) {
    // 捨てるカードが無い（消費分の補充だけ）場合は、フェードアウト演出も飛ばして直接授かり演出へ
    document.getElementById('confirmDiscardBtn').style.display = 'none';
    playDiscardResultOverlay(swapFn, onAllDone);
    return;
  }

  // 選んだカードを、デッキ上（discardGrid）でそのままふわっと消す。中央に改めて表示はしない。
  document.getElementById('confirmDiscardBtn').style.display = 'none';
  const grid = document.getElementById('discardGrid');
  const els = sortedIdxs.map(i => grid.querySelector(`.card[data-discardidx="${i}"]`)).filter(Boolean);
  els.forEach((el, i) => {
    setTimeout(() => el && el.classList.add('is-discarding'), i * ANIM.discard.cardFadeStagger);
  });
  setTimeout(() => {
    playDiscardResultOverlay(swapFn, onAllDone);
  }, els.length * ANIM.discard.cardFadeStagger + ANIM.discard.cardFadeTail);
}

// 画面中央のオーバーレイに、代わりに引いたカードだけを表示する（下からふわっとフェードイン）。
// swapFn は演出開始と同時に呼ばれ、実際の手札の入れ替えを行い、新カード配列を返す。
// onAllDone は演出が全部終わったときに呼ばれる。
// このオーバーレイはプレイヤー専用（敵のターン開始は resolveEnemyTurnStartInstantly で演出なしに処理する）。
function playDiscardResultOverlay(swapFn, onAllDone) {
  const overlay = document.getElementById('discardResultOverlay');
  const label = document.getElementById('discardResultLabel');
  const cardsEl = document.getElementById('discardResultCards');

  // ステップ1：まずデッキ部分だけを薄暗くする（この時点ではカードはまだ出さない）
  label.textContent = '';
  cardsEl.innerHTML = '';
  overlay.classList.add('show');

  // 暗転のtransition（0.4s）が終わるのを待ってから、代わりに引いたカードを表示する
  setTimeout(() => {
    // 手札の入れ替えを実行し、新カードを受け取る
    const newCards = swapFn();

    label.textContent = '新しく授かった神器';
    cardsEl.innerHTML = newCards.map((c, i) => {
      const delay = `style="animation-delay:${i * (ANIM.discard.resultCardStagger / 1000)}s"`;
      return `
        <div class="discard-result-item" ${delay}>
          <div class="discard-result-name">${c.name}</div>
          <div class="card card-simplified type-${c.type} is-new ${c.legend ? 'is-legend':''} ${bcCardClass(c)} ${itemCardClass(c)}">
            <div class="new-tag">NEW</div>
            <div class="card-type-bar"></div>
            ${cardArtHtml(c)}
            ${legendSparkleHtml(c)}
            ${bcWatermarkHtml(c)}
            ${instantIconHtml(c)}
            ${cardTopLeftAttrHtml(c)}
            ${cardTopRightStatusHtml(c)}
            <div class="card-face">
              ${powerBadgeHtml(c)}
            </div>
          </div>
        </div>
      `;
    }).join('');

    const resultHoldTime = Math.max(ANIM.discard.resultBaseHold, ANIM.discard.resultPerCardBase + newCards.length * ANIM.discard.resultPerCard); // 枚数が多い時は少し長めに見せる
    setTimeout(() => {
      overlay.classList.remove('show');
      setTimeout(() => {
        cardsEl.innerHTML = '';
        onAllDone();
      }, ANIM.discard.overlayFadeOut); // フェードアウトのtransitionが終わるのを待ってから中身を空にする
    }, resultHoldTime);
  }, ANIM.discard.overlayFadeIn);
}

function openDiscardModal() {
  renderDiscardGrid();
  document.getElementById('handModeNormal').style.display = 'none';
  document.getElementById('handModeBattle').style.display = 'none';
  document.getElementById('handModeAttackPrep').style.display = 'none';
  document.getElementById('handModeDefense').style.display = 'none';
  document.getElementById('handModeDiscard').style.display = 'block';
  document.querySelector('.hand-section').classList.add('is-discard-mode');
}

function closeDiscardModal() {
  document.getElementById('handModeDiscard').style.display = 'none';
  document.getElementById('handModeNormal').style.display = 'block';
  document.querySelector('.hand-section').classList.remove('is-discard-mode');
}

function renderDiscardGrid() {
  const { who, discardIdxs } = state.pendingDiscard;
  const self = state[who];
  const grid = document.getElementById('discardGrid');
  document.getElementById('confirmDiscardBtn').style.display = 'inline-block';

  if (self.hand.length === 0) {
    grid.innerHTML = `<div class="empty-hand">手札がない</div>`;
  } else {
    const withIdx = self.hand.map((c, idx) => ({ c, idx }));
    // 通常デッキ表示と全く同じ並び順（種別→種別内の数値順）にする
    const items = withIdx.slice().sort((a, b) => compareHandCards(a.c, b.c));

    grid.innerHTML = items.map(({c, idx}) => {
      const isSelected = discardIdxs.includes(idx);
      return `
      <div class="card card-simplified type-${c.type} ${isSelected ? 'selected':'discard-dim'} ${c.legend ? 'is-legend':''} ${bcCardClass(c)} ${itemCardClass(c)}" data-discardidx="${idx}">
        ${isSelected ? '<div class="selected-tag">捨てる</div>' : ''}
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
    grid.querySelectorAll('.card').forEach(el => {
      const i = parseInt(el.dataset.discardidx);
      const c = self.hand[i];
      el.addEventListener('mouseenter', () => showCardDetail(c));
      el.addEventListener('mouseleave', () => showCardDetail(null));
      el.addEventListener('touchstart', () => showCardDetail(c), { passive: true });
      el.addEventListener('click', () => {
        const sel = state.pendingDiscard.discardIdxs;
        const pos = sel.indexOf(i);
        if (pos === -1) {
          if (sel.length >= DISCARD_MAX) return; // 最大枚数を超えては選べない
          sel.push(i);
        } else {
          sel.splice(pos, 1);
        }
        renderDiscardGrid();
      });
    });
  }
  updateConfirmDiscardBtn();
}

function updateConfirmDiscardBtn() {
  const btn = document.getElementById('confirmDiscardBtn');
  const { discardIdxs } = state.pendingDiscard;
  btn.textContent = discardIdxs.length > 0
    ? `選んだ${discardIdxs.length}枚を捨てて次へ`
    : `何も捨てずに次へ（最大${DISCARD_MAX}枚まで捨てれる）`;
}

document.getElementById('confirmDiscardBtn').addEventListener('click', () => {
  if (!state.pendingDiscard) return;
  proceedDiscardConfirm();
});
