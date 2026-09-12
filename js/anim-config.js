/* ============================================================
   anim-config.js — 演出タイミングの設定担当ファイル

   ゲーム内の「間（ま）」や演出の速さを、この1ファイルの
   数値だけ見て・変えれば済むようにまとめてある。
   「もっとテンポよくしたい」「ゆっくり見せたい」というときは、
   まずこのファイルを開けばいい。

   このファイルは他のどのファイルにも依存しないので、
   cards.js の直後、一番最初に読み込んで問題ない。
   ============================================================ */


/* ===================== アニメーション設定（すべての待ち時間をここに集約） =====================
   ゲーム内の「間（ま）」や演出の速さを調整したいときは、このオブジェクトの数値だけ変えればいい。
   単位はすべてミリ秒（1000 = 1秒）。
   一部の値は style.css 側のアニメーション時間（transition / animation）と対になっているので、
   その場合はコメントで対応する CSS 側のセレクタ名を書いてある。ズレると演出が不自然になるので
   変える時はセットで直すこと。
   ============================================================ */
const ANIM = {
  // --- 数値演出（中央パネルの増減表示・行動数値枠の攻撃力/防御力） ---
  statEffect: {
    countUp: 300,       // カウントアップ（0→実際の数値）にかける時間
    hold: 300,          // カウントアップ完了後、数値を見せたまま静止する時間
    holdTextOnly: 800, // カウントアップの無い演出（BLOCK/NULLIFY等のテキストのみ）を静止させる時間
    gapBetween: 300,    // ある演出が終わってから、キューの次の演出を始めるまでの間
  },

  // --- カード演出全般 ---
  cardFlash: {
    panelPulse: 300,       // flashPanelEffect: HP/MPパネルが赤く光る等のパルス演出（CSS .hit-effect 等と対）
    sparkleLife: 300,     // playHealSparkle: きらきら粒1個が消えるまでの寿命（CSS .heal-sparkle と対）
    sparkleMaxDelay: 200,  // playHealSparkle: きらきら粒が出始めるタイミングをこの範囲内でランダムにずらす
  },

  // --- 攻撃フェイズ（resolveAttack 〜 applyPostDamageEffects） ---
  battle: {
    attackCardAppear: 300,     // 攻撃開始 → 攻撃カードが登場するまでの間
    afterAttackCardShown: 500,// 攻撃カード表示 → 攻撃力カウント開始までの間
    beforeDefensePhase: 300,   // 攻撃力演出が終わってから防御選択（または即時解決）に進むまでの間
    defenseCardAppear: 300,    // 防御側の防具/素受け演出を見せてから、防御力カウントを始めるまでの間
    beforeDamageApply: 300,    // 防御力カウント後、実際にダメージを適用するまでの間
    beforeDemeritPhase: 300,   // ダメージ演出後、デメリット（自傷等）演出に進むまでの間
    beforeDoubleAttack: 300,   // 2回攻撃（doubleAttack）の1発目が終わってから2発目を始めるまでの間
    battleShowcaseClose: 300,  // closeBattleShowcase: カードが消えてからモーダルを閉じるまでの間（CSS .is-leaving と対）
    finishBattleHold: 300,     // 最後の演出後、余韻を置いてからバトルモーダルを閉じるまでの間
    enemyContinueAttack: 300, // ターン消費なし攻撃でCPUがもう一手続けて打つまでの間
    drainMpHold: 300,         // 伝説「drainMp」演出専用の表示時間
  },

  // --- 回復アイテム演出（playHealSequence） ---
  heal: {
    beforeBurst: 300,     // カード表示 → カードが弾けて回復適用されるまでの間
    afterBurstHold: 600,   // 回復演出が終わってからターンを進めるまでの間
  },

  // --- ターン開始時の手札整理（捨てる→授かる演出） ---
  discard: {
    cardFadeStagger: 120,      // 捨てるカードが1枚ずつフェードアウトし始める間隔（CSS .is-discarding と対）
    cardFadeTail: 300,         // 最後のカードが消え切るまでの余裕時間（フェードアウトのアニメーション長込み）
    overlayFadeIn: 250,        // discard-result-overlay の暗転が終わるまでの間（CSS transition と対）
    resultBaseHold: 1000,      // 授かったカードを見せる最低時間
    resultPerCardBase: 200,   // 授かったカードの表示時間を計算する基準値（この値 + 枚数×resultPerCard と、resultBaseHold の大きい方を採用）
    resultPerCard: 300,        // 授かったカード1枚ごとに追加で見せる時間（枚数が多い時に自動で伸ばす）
    overlayFadeOut: 250,       // discard-result-overlay を閉じるtransitionが終わるまでの間
    resultCardStagger: 100,    // 授かったカードが1枚ずつ登場し始める間隔（.discard-result-item のanimation-delayと対）
  },
};
