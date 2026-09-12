/* ============================================================
   battle.js — 攻撃・防御フェイズ担当ファイル

   ここには「攻撃を実際に解決する処理（resolveAttack）」から、
   「防御を選ぶ画面」「攻撃準備（PLUSカード選択）画面」、
   実際のダメージ計算まで、戦闘の核となるロジックがまとまっている。

   全ファイルの中で一番大きく、複雑な部分。攻撃力や防御力の
   計算がおかしい、演出のタイミングがずれている、といった
   不具合はまずここを疑うとよい。

   このファイルは card-rules.js, anim-config.js, stat-effects.js,
   card-view.js より後に読み込む必要がある。
   ============================================================ */


function playHealSequence(who, oppKey, card, amounts, logMsg) {
  const self = state[who];
  if (who === 'player') lockAction(); // 演出が終わるまで、他のカードを選べないようにする
  if (amounts.hp) {
    self.hp += amounts.hp;
    queueStatEffect(who, 'heal-hp', amounts.hp);
  }
  if (amounts.mp) {
    self.mp += amounts.mp;
    queueStatEffect(who, 'heal-mp', amounts.mp);
  }
  addLog(logMsg, 'heal');
  flashPanelEffect(who, 'heal-effect');
  playHealSparkle(who);
  render();

  // 回復演出キューが全部終わるのを待ってから、ロックを解除してターンを進める
  onStatEffectQueueEmpty(() => {
    unlockAction();
    endTurnAfterCard(who, oppKey);
  });
}

// 回復・加護時のきらきらエフェクト（パネルの周りに小さな光の粒を散らす）
// kind: 'heal'（緑、既定）/ 'guard'（紫）
function playHealSparkle(who, kind) {
  const panel = document.getElementById(who === 'player' ? 'playerPanel' : 'enemyPanel');
  if (!panel) return;
  const colorClass = kind === 'guard' ? ' sparkle-guard' : '';
  for (let i = 0; i < 6; i++) {
    const sparkle = document.createElement('div');
    sparkle.className = `heal-sparkle${colorClass}`;
    sparkle.style.left = `${10 + Math.random() * 80}%`;
    sparkle.style.top = `${10 + Math.random() * 80}%`;
    sparkle.style.animationDelay = `${Math.random() * (ANIM.cardFlash.sparkleMaxDelay / 1000)}s`;
    panel.appendChild(sparkle);
    setTimeout(() => sparkle.remove(), ANIM.cardFlash.sparkleLife);
  }
}

/* ===================== 防御フェイズ ===================== */
function resolveAttack(attackerKey, defenderKey, card, isSecondHit, extraCardsUsed, plusCards) {
  const defender = state[defenderKey];
  const attacker = state[attackerKey];
  const attackerLabel = attackerKey === 'player' ? 'あなた' : '影';
  const defenderLabel = defenderKey === 'player' ? 'あなた' : '影';

  // instant: true の武器カード（例：影手裏剣）は「ターンを消費せず攻撃、防御不可」の専用挙動。
  // この場合は下段の大きなバトル演出（攻撃カードがシュッと出てくる表示）を省略し、
  // 上段のHP/MPパネル脇にある攻撃力・防御力タイトルの演出だけで済ませる。
  const isNoTurnAttack = card.instant && card.type === 'weapon';

  // 混乱状態：カード使用時に25%の確率で効果が不発になる。カード自体は消費されるが、
  // ターン消費なし（instant:true）のカードは不発でもターンを進めない（isNoTurnAttackの通常フローに任せる）。
  const confusedMiss = hasStatus(attacker, 'confusion') && Math.random() < 0.25;
  if (confusedMiss) {
    addLog(`${attackerLabel}は混乱により「${card.name}」の効果が不発に終わった`, 'system');
    showActionTextOnly(attackerKey, '💫混乱で行動不可！', 'status-confusion');
  }

  // 攻撃フェイズ開始〜バトル終了まで、上段中央パネルの背景を1枚目の攻撃カードの絵に固定する
  // （2回攻撃の2発目 isSecondHit では、既に1発目で固定済みなのでここでは触らない）
  if (!isSecondHit) pinDetailArt(card);

  if (!isNoTurnAttack) {
    // 攻撃〜ダメージ演出が全部終わるまで、専用モーダルを開いたままにする
    openBattleShowcase();
    // 演出ステップ1：攻撃カード決定 →(0.8秒)→ ステップ2：攻撃カード表示（追加したPLUSカードも一緒に表示する）
    setTimeout(() => {
      showAttackFlash(attackerKey, card);
      showPlusCardsFlash(attackerKey, plusCards);
    }, ANIM.battle.attackCardAppear);
    // バトルフェイズに入った瞬間から、数値が決まるより先に「攻撃力」「防御力」のタイトルを出しておく
    showActionTitlePlaceholder(attackerKey, 'atk-preview');
    showActionTitlePlaceholder(defenderKey, 'def');
  }
  // ターン矢印表示は一旦撤去（表示が崩れるため）
  // showActionIndicator(attackerKey, defenderKey);

  // 切り札級カードの発動コスト処理
  if (card.castCostHp) {
    attacker.hp = Math.max(0, attacker.hp - card.castCostHp);
    addLog(`${attackerLabel}は「${card.name}」の代償としてHP${card.castCostHp}を支払った`, 'hit');
    queueStatEffect(attackerKey, 'cost-hp', card.castCostHp);
    flashPanelEffect(attackerKey, 'hit-effect');
    if (attacker.hp <= 0) {
      recordHit(attackerKey, card, `代償ダメージ${card.castCostHp}（自滅）`);
      state.over = true;
      if (!isNoTurnAttack) closeBattleShowcase();
      showOverlay(attackerKey === 'enemy');
      render();
      return;
    }
  }
  if (card.castCostMp) {
    attacker.mp = Math.max(0, attacker.mp - card.castCostMp);
    addLog(`${attackerLabel}は「${card.name}」の代償としてMP${card.castCostMp}を支払った`, 'system');
    queueStatEffect(attackerKey, 'cost-mp', card.castCostMp);
  }
  if (card.castCostMoney) {
    attacker.money = Math.max(0, attacker.money - card.castCostMoney);
    addLog(`${attackerLabel}は「${card.name}」の代償として${card.castCostMoney}Gを支払った`, 'system');
    queueStatEffect(attackerKey, 'cost-money', card.castCostMoney);
  }
  // 旧形式のmiracleコスト（cost が数値＝MPのみ）。攻撃準備フェイズを経由するカードは、
  // ここ（実際に攻撃が発動する直前）で初めて消費する。キャンセルすれば一切払わずに済む。
  if (card.type === 'miracle' && typeof card.cost === 'number') {
    attacker.mp = Math.max(0, attacker.mp - card.cost);
    addLog(`${attackerLabel}は「${card.name}」の発動でMP${card.cost}を消費した`, 'system');
    queueStatEffect(attackerKey, 'cost-mp', card.cost);
  }

  const INSTANT_KILL_ENABLED = false; // TODO: システム完成後にtrueへ戻す
  const isInstantKill = INSTANT_KILL_ENABLED && card.attr === '闇';
  const isUnblockable = isInstantKill || isNoTurnAttack;

  // 祝福「underdogAtk」：自分のHPが相手より低いと攻撃力2倍
  let effectivePower = card.power || 0;

  // plus: 攻撃力強化。武器・防具・アイテム問わず「攻撃として使う時」だけ加算される（防御・回復には適用しない）
  if (typeof card.plus === 'number') {
    effectivePower += card.plus;
  }

  // 確率武器（card.hitChance を持つカード）の命中判定。
  // 攻撃者が暗闇状態なら、この判定自体をスキップして必中にする。
  let missedByChance = false;
  if (typeof card.hitChance === 'number') {
    if (hasStatus(attacker, 'blind')) {
      showActionTextOnly(attackerKey, '🌑暗闇で必中！', 'status-blind');
    } else if (Math.random() >= card.hitChance) {
      missedByChance = true;
      effectivePower = 0;
      addLog(`${attackerLabel}の「${card.name}」は命中率判定に外れ、攻撃が外れた`, 'system');
    }
  }

  // 混乱による不発が確定していれば、以降の攻撃力強化・伝説効果はすべて無視して0で確定させる
  if (confusedMiss) {
    effectivePower = 0;
  }

  if (!confusedMiss && card.blessing === 'underdogAtk' && attacker.hp < defender.hp) {
    effectivePower *= 2;
    addLog(`${attackerLabel}は劣勢の逆転祝福を受け、攻撃力が2倍になった！`, 'system');
  }

  // 伝説「mpDamage」：自分の現在MP×2のダメージ
  if (!confusedMiss && card.legend === 'mpDamage') {
    effectivePower = attacker.mp * 2;
    addLog(`${attackerLabel}は「${card.name}」でMP(${attacker.mp})×2＝${effectivePower}のダメージを刻んだ`, 'system');
  }

  // 伝説「drainMp」：相手のMPを0にする（発動時点で即実行、ダメージ自体は無し）
  if (!confusedMiss && card.legend === 'drainMp') {
    const drained = defender.mp;
    defender.mp = 0;
    addLog(`${attackerLabel}は「${card.name}」で${defenderLabel}のMPを完全に封じた（-${drained}）`, 'system');
    flashPanelEffect(defenderKey, 'hit-effect');
    setTimeout(() => {
      closeBattleShowcase();
      endTurnAfterCard(attackerKey, defenderKey);
    }, ANIM.battle.drainMpHold);
    return;
  }

  // PLUSカードに属性があれば、元の攻撃カードが無属性でも、攻撃全体の属性がPLUSカードの属性に変わる
  // （複数枚使った場合は、属性を持つ最初のPLUSカードを採用する）
  const plusCardWithAttr = (plusCards || []).find(pc => pc.attr && pc.attr !== '無');
  const effectiveAttr = plusCardWithAttr ? plusCardWithAttr.attr : card.attr;

  if (isUnblockable) {
    addLog(`${attackerLabel}が「${card.name}」(${effectiveAttr}${effectivePower})で攻撃！ ${card.attr==='闇'?'闇属性は防御不可能':'光属性は防御不可能'}`, 'system');
  } else {
    addLog(`${attackerLabel}が「${card.name}」(${effectiveAttr||''}${effectivePower})で攻撃！ ${defenderLabel}は防御を選べる`, 'system');
  }

  // 防御可能かどうか・倍率は「攻撃側の実際の属性（effectiveAttr）× 防具の属性」の組み合わせで決まる。
  // 伝説防具（nullify/reflect）は特別扱いで、どんな攻撃も等倍（1倍）で無条件に防げる。
  // それ以外は ATTR_DEFENSE_MULTIPLIER の対応表を参照し、倍率が無い組み合わせは防御不可。
  const getArmorMultiplier = (armorCard) => {
    if (armorCard.legend === 'nullify' || armorCard.legend === 'reflect') return 1;
    if (isUnblockable) return null;
    return getDefenseMultiplier(effectiveAttr, armorCard.attr);
  };

  const usableArmors = defender.hand
    .map((c, i) => ({c, i, defenseMultiplier: getArmorMultiplier(c)}))
    .filter(({c, defenseMultiplier}) => (c.type === 'armor' || typeof c.defense === 'number') && defenseMultiplier !== null);

  // 「ターン消費なし攻撃」（instant武器）は防御不可なので、攻撃力予告・防御選択フェイズを一切挟まず
  // 即座にダメージを適用する（上段のダメージ数値演出だけがいきなり表示される、シンプルな流れ）
  if (isNoTurnAttack) {
    applyDefenseDamage(attackerKey, defenderKey, card, effectivePower, isSecondHit, extraCardsUsed, [], 0, false, isNoTurnAttack);
    return;
  }

  state.pendingDefense = { attackerKey, defenderKey, card, usableArmors, isUnblockable, selected: [], effectivePower, isSecondHit, extraCardsUsed: extraCardsUsed || 0, isNoTurnAttack };

  // 演出ステップ2（攻撃カード表示）〜攻撃力カウントの後、しっかり間を置いて防御選択へ
  // （攻撃力の演出が完全に終わったことを applyFn コールバックで確実に検知してから、間を置いて進める。
  //   ANIM の数値を極端に短く調整しても、演出未完了のまま次に進んでしまわないようにするための設計）
  const proceedToDefense = (fn) => {
    setTimeout(fn, ANIM.battle.beforeDefensePhase);
  };

  setTimeout(() => {
    queueStatEffect(attackerKey, 'atk-preview', effectivePower, () => {
      if (isUnblockable && usableArmors.length === 0) {
        // 光・闇は防御不可、かつ伝説防具も無ければ、モーダルを出さず即時解決
        proceedToDefense(() => finalizeDefense([]));
        return;
      }

      if (defenderKey === 'player') {
        if (usableArmors.length === 0) {
          // 防御に使える防具を1枚も持っていない場合、防御選択画面自体を出さず、
          // 防御せず受ける場合と同じ処理を直接呼ぶ
          proceedToDefense(() => finalizeDefense([]));
          return;
        }
        render();
        proceedToDefense(openDefenseModal);
      } else {
        // CPU防御判断：伝説防具があれば最優先で使用。それ以外は防げる防具をダメージを上回るまでランダムに複数選択
        let chosen = [];
        const legendOption = usableArmors.find(({c}) => c.legend === 'nullify' || c.legend === 'reflect');
        if (legendOption) {
          chosen = [legendOption.i];
        } else if (usableArmors.length > 0) {
          const pool = [...usableArmors];
          let remaining = effectivePower;
          const maxPicks = hasStatus(defender, 'flash') ? 1 : Infinity; // 閃光状態：防具は1枚しか選べない
          while (pool.length > 0 && remaining > 0 && chosen.length < maxPicks) {
            const pickIdx = Math.floor(Math.random() * pool.length);
            const picked = pool.splice(pickIdx, 1)[0];
            chosen.push(picked.i);
            const p = (picked.c.legend === 'mpDefense' ? defender.mp * 2 : (typeof picked.c.defense === 'number' ? picked.c.defense : picked.c.power)) * picked.defenseMultiplier;
            remaining -= p;
            if (Math.random() < 0.3) break; // たまに防ぎきらず様子見
          }
        }
        proceedToDefense(() => finalizeDefense(chosen));
      }
    }, true); // 第5引数 force: true → amount が 0 以下でも必ず演出を表示し、applyFn を確実に呼ぶ
  }, ANIM.battle.afterAttackCardShown);
}

function finalizeDefense(armorIdxs) {
  const { attackerKey, defenderKey, card, effectivePower, isSecondHit, extraCardsUsed, isNoTurnAttack, usableArmors } = state.pendingDefense;
  const defender = state[defenderKey];
  const attacker = state[attackerKey];
  const defenderLabel = defenderKey === 'player' ? 'あなた' : '影';

  const idxs = (armorIdxs || []).slice().sort((a,b) => b-a); // 降順で splice しないとズレる
  const armorCards = idxs.map(i => {
    const c = defender.hand[i];
    // 防御力計算で使う属性倍率を、カード自体に一時プロパティとして埋め込んでおく
    // （splice で手札からは取り除くが、このカードオブジェクト自体は armorCards 経由で使い続けるため）
    const found = usableArmors.find(u => u.i === i);
    c._defenseMultiplier = found ? found.defenseMultiplier : 1;
    return c;
  });
  idxs.forEach(i => defender.hand.splice(i, 1)); // 使用した防具は手札から消える
  const usedCount = armorCards.length;
  const blocked = usedCount > 0;

  // 混乱状態：防具を選んで防御する行為も「カード使用」とみなし、25%の確率で効果が不発になる。
  // 防具自体は消費されるが、防御効果（totalDefense）が発動しない＝ダメージがそのまま通る。
  const defenderConfusedMiss = blocked && hasStatus(defender, 'confusion') && Math.random() < 0.25;
  if (defenderConfusedMiss) {
    addLog(`${defenderLabel}は混乱により防御が不発に終わった`, 'system');
    showActionTextOnly(defenderKey, '💫混乱で行動不可！', 'status-confusion');
  }

  // プレイヤーが実際に防御選択モーダルを開いていた場合のみ、閉じて元の演出画面に戻す
  // （防具を1枚も持っておらず、モーダル自体を開かずに finalizeDefense が呼ばれるケースもあるため）
  if (defenderKey === 'player' && document.getElementById('handModeDefense').style.display !== 'none') {
    closeDefenseModal();
  }

  if (blocked) {
    const namesText = armorCards.map(c => `「${c.name}」`).join('+');
    addLog(`${defenderLabel}は${namesText}で防御態勢に入った`, 'system');
    // 演出の流れ：相手防御カード表示 →(0.7秒)→ 防御力カウントアップ→表示終了を待って→ シュッと攻撃演出＆結果
    armorCards.forEach(c => showAttackFlash(defenderKey, c, '防'));

    const totalDefense = defenderConfusedMiss ? 0 : armorCards.reduce((sum, c) => {
      let p = (typeof c.defense === 'number') ? c.defense : c.power;
      if (c.legend === 'mpDefense') p = defender.mp * 2;
      if (c.blessing === 'underdogDef' && defender.hp < attacker.hp) p *= 2;
      // 伝説防具（nullify/reflect）は _defenseMultiplier が 1 になっているので、そのまま等倍で加算される
      p *= c._defenseMultiplier;
      return sum + p;
    }, 0);
    setTimeout(() => {
      queueStatEffect(defenderKey, 'def', totalDefense);
      onStatEffectQueueEmpty(() => setTimeout(() => {
        applyDefenseDamage(attackerKey, defenderKey, card, effectivePower, isSecondHit, extraCardsUsed, armorCards, usedCount, blocked, isNoTurnAttack, defenderConfusedMiss);
      }, ANIM.battle.beforeDamageApply));
    }, ANIM.battle.defenseCardAppear);
    return;
  }

  // 防御しなかった場合も、防御力0として同じ演出フローに乗せる（防具を選んだ場合と挙動を揃える）
  addLog(`${defenderLabel}は防御せずに受けた`, 'system');
  setTimeout(() => {
    queueStatEffect(defenderKey, 'def', 0, null, true); // 第5引数: 0でも強制的に表示する
    onStatEffectQueueEmpty(() => setTimeout(() => {
      applyDefenseDamage(attackerKey, defenderKey, card, effectivePower, isSecondHit, extraCardsUsed, armorCards, usedCount, blocked, isNoTurnAttack, defenderConfusedMiss);
    }, ANIM.battle.beforeDamageApply));
  }, ANIM.battle.defenseCardAppear);
}

function applyDefenseDamage(attackerKey, defenderKey, card, effectivePower, isSecondHit, extraCardsUsed, armorCards, usedCount, blocked, isNoTurnAttack, confusedMiss) {
  const defender = state[defenderKey];
  const attacker = state[attackerKey];
  const attackerLabel = attackerKey === 'player' ? 'あなた' : '影';
  const defenderLabel = defenderKey === 'player' ? 'あなた' : '影';
  const isInstantKill = false; // TODO: システム完成後に card.attr === '闇' へ戻す

  // 決着（実際のダメージ演出）の瞬間なので、ここまで残していた攻撃力予告・防御力の表示をクリアする
  clearAllActionPreviews();
  // 防御フェイズ中に表示され続けていたカード詳細（攻撃カードやホバーした防具）も、
  // バトル演出が始まるこのタイミングで一旦ホバー空欄（プレースホルダー）に戻す
  showCardDetail(null);

  let dmg = effectivePower || 0;
  let actualDamage = 0; // 実際に相手に通ったダメージ（祝福・呪い計算用）

  // 加護（例："守りの札"系）で蓄えた軽減量をここで消費する。1回で使い切らなければ、
  // 残った軽減量は次回以降のダメージにも持ち越される（何ターンでも持続）
  if (defender.nextDefenseReduction > 0 && dmg > 0) {
    const reduced = Math.min(defender.nextDefenseReduction, dmg);
    dmg -= reduced;
    defender.nextDefenseReduction -= reduced;
    const remainText = defender.nextDefenseReduction > 0 ? `（残り加護${defender.nextDefenseReduction}）` : '（加護を使い切った）';
    addLog(`${defenderLabel}の加護がダメージを${reduced}軽減した${remainText}`, 'system');
  }

  // 伝説の防具（nullify / reflect）が選択されている場合、通常のダメージ計算より優先
  const legendArmor = armorCards.find(c => c.legend === 'nullify' || c.legend === 'reflect');

  if (legendArmor && legendArmor.legend === 'nullify') {
    addLog(`${defenderLabel}は「${legendArmor.name}」で攻撃を完全に無効化した！`, 'system');
    showActionTextOnly(defenderKey, '完全無効化', 'block');
  } else if (legendArmor && legendArmor.legend === 'reflect') {
    const reflectDmg = dmg;
    attacker.hp = Math.max(0, attacker.hp - reflectDmg);
    addLog(`${defenderLabel}は「${legendArmor.name}」で攻撃を跳ね返した！ ${attackerLabel}に${reflectDmg}ダメージ（${defenderLabel}は無傷）`, 'hit');
    queueStatEffect(attackerKey, 'atk', reflectDmg);
    flashPanelEffect(attackerKey, 'hit-effect');
    recordHit(attackerKey, legendArmor, `反射ダメージ${reflectDmg}`);
  } else if (isInstantKill) {
    actualDamage = defender.hp;
    defender.hp = 0;
    addLog(`${attackerLabel}の「${card.name}」が${defenderLabel}を貫いた…闇の即死効果！`, 'death');
    showActionTextOnly(defenderKey, '即死', 'kill');
    recordHit(defenderKey, card, '即死効果');
    flashPanelEffect(defenderKey, 'hit-effect');
  } else if (blocked) {
    const totalDefense = confusedMiss ? 0 : armorCards.reduce((sum, c) => {
      // 防御力は defense フィールドを優先参照（武器を防具として使う場合など）。
      // plus は攻撃強化専用なので、防御力の計算には一切加算しない。
      let p = (typeof c.defense === 'number') ? c.defense : c.power;
      if (c.legend === 'mpDefense') {
        p = defender.mp * 2;
        addLog(`${defenderLabel}は「${c.name}」でMP(${defender.mp})×2＝${p}の防御力を展開した`, 'system');
      }
      if (c.blessing === 'underdogDef' && defender.hp < attacker.hp) {
        p *= 2;
        addLog(`${defenderLabel}は「${c.name}」の祝福で防御力が2倍になった！`, 'system');
      }
      // 属性の相性（同属性2倍・対属性2倍・無関係0.5倍など）を反映する
      const multiplier = c._defenseMultiplier || 1;
      if (multiplier !== 1) {
        p *= multiplier;
        addLog(`${defenderLabel}の「${c.name}」は属性相性で防御力が${multiplier}倍になった`, 'system');
      }
      return sum + p;
    }, 0);

    const absorbed = Math.min(totalDefense, dmg);
    dmg -= absorbed;
    addLog(`${defenderLabel}は合計${absorbed}ダメージを軽減した`, 'system');
    if (dmg > 0) {
      defender.hp = Math.max(0, defender.hp - dmg);
      actualDamage = dmg;
      addLog(`防ぎきれず${dmg}ダメージが${defenderLabel}に通った`, 'hit');
      queueStatEffect(defenderKey, 'atk', dmg);
      recordHit(defenderKey, card, `${dmg}ダメージ（防ぎきれず）`);
      playAttackHitPulse(attackerKey);
      flashPanelEffect(defenderKey, 'hit-effect');
    } else {
      addLog(`${defenderLabel}は完全に防御した！`, 'system');
      showActionTextOnly(defenderKey, '完全防御', 'block');
      playBlockedBounce(attackerKey);
    }
  } else {
    // 防御しない/できない → シールドがあれば消費
    if (defender.shield > 0) {
      const absorbed = Math.min(defender.shield, dmg);
      dmg -= absorbed;
      defender.shield = 0;
      addLog(`${defenderLabel}の護りが${absorbed}のダメージを吸収`, 'system');
    }
    defender.hp = Math.max(0, defender.hp - dmg);
    actualDamage = dmg;
    addLog(`${attackerLabel}の「${card.name}」で${defenderLabel}に${dmg}ダメージ！`, 'hit');
    if (dmg > 0) {
      queueStatEffect(defenderKey, 'atk', dmg);
      recordHit(defenderKey, card, `${dmg}ダメージ`);
      playAttackHitPulse(attackerKey);
      flashPanelEffect(defenderKey, 'hit-effect');
    }
  }

  // 演出ステップ4（攻撃数値演出）が全部終わるのを待ってから、間を置いてステップ5（デメリット演出）へ進む
  onStatEffectQueueEmpty(() => setTimeout(() => {
    applyPostDamageEffects(attackerKey, defenderKey, card, actualDamage, isSecondHit, extraCardsUsed, usedCount, isNoTurnAttack);
  }, ANIM.battle.beforeDemeritPhase));
}

function applyPostDamageEffects(attackerKey, defenderKey, card, actualDamage, isSecondHit, extraCardsUsed, usedCount, isNoTurnAttack) {
  const defender = state[defenderKey];
  const attacker = state[attackerKey];
  const attackerLabel = attackerKey === 'player' ? 'あなた' : '影';
  const defenderLabel = defenderKey === 'player' ? 'あなた' : '影';

  // 祝福効果：ダメージが実際に通った場合のみ発動
  if (actualDamage > 0) {
    if (card.blessing === 'lifesteal') {
      attacker.hp += actualDamage;
      addLog(`${attackerLabel}は「${card.name}」の祝福でHP${actualDamage}を吸収した`, 'heal');
      queueStatEffect(attackerKey, 'heal-hp', actualDamage);
      flashPanelEffect(attackerKey, 'heal-effect');
      playHealSparkle(attackerKey);
    }
    if (card.blessing === 'moneysteal') {
      const stolen = Math.min(defender.money, actualDamage);
      defender.money -= stolen;
      attacker.money += stolen;
      addLog(`${attackerLabel}は「${card.name}」の祝福で${stolen}Gを奪った`, 'system');
    }
    if (card.blessing === 'guard3') {
      attacker.shield += 3;
      addLog(`${attackerLabel}は「${card.name}」の祝福で護り+3を得た（次の被弾まで有効）`, 'system');
    }
  }

  // 呪い効果：与えたダメージ（防御後の実ダメージ）の半分が常に自分にも入る
  if (card.curse2 === 'halfBackfire' && actualDamage > 0) {
    const backfire = Math.ceil(actualDamage / 2);
    attacker.hp = Math.max(0, attacker.hp - backfire);
    addLog(`${attackerLabel}は「${card.name}」の呪いにより${backfire}の反動ダメージを受けた`, 'hit');
    queueStatEffect(attackerKey, 'curse', backfire);
    flashPanelEffect(attackerKey, 'hit-effect');
  }

  // 状態異常付与武器：ダメージが実際に通った時だけ、相手に指定した状態異常を永続で付与する
  // （card.inflictStatus に 'poison' / 'blind' / 'flash' / 'curse' / 'confusion' のいずれかを指定する。
  //   ['poison', 'blind'] のように配列にすれば、1枚の武器で複数の状態異常を同時に与えられる）
  if (card.inflictStatus && actualDamage > 0) {
    const statusTypes = Array.isArray(card.inflictStatus) ? card.inflictStatus : [card.inflictStatus];
    statusTypes.forEach(type => {
      inflictStatus(defenderKey, defender, type, undefined, `「${card.name}」の一撃を受けた`);
    });
  }

  // 自分にもダメージが返る効果（selfDamageフィールド優先、旧テキストは1固定）。これも呪い扱いで紫表示にする
  if (card.selfDamage) {
    attacker.hp = Math.max(0, attacker.hp - card.selfDamage);
    addLog(`${attackerLabel}にも反動で${card.selfDamage}ダメージ`, 'hit');
    queueStatEffect(attackerKey, 'curse', card.selfDamage);
    flashPanelEffect(attackerKey, 'hit-effect');
  } else if (card.effect && card.effect.includes('自分にも')) {
    attacker.hp = Math.max(0, attacker.hp - 1);
    addLog(`${attackerLabel}にも余波で1ダメージ`, 'hit');
    queueStatEffect(attackerKey, 'curse', 1);
    flashPanelEffect(attackerKey, 'hit-effect');
  }

  state.pendingDefense = null;

  // 伝説「doubleAttack」：1回目のダメージ演出が全部終わったら、間を置いて2回目の攻撃を発動（モーダルは開いたまま継続）
  if (card.legend === 'doubleAttack' && !isSecondHit && attacker.hp > 0 && defender.hp > 0) {
    checkGameOver();
    if (state.over) { closeBattleShowcase(); render(); return; }
    render();
    addLog(`${attackerLabel}の「${card.name}」が2撃目を放つ！`, 'system');
    onStatEffectQueueEmpty(() => setTimeout(() => resolveAttack(attackerKey, defenderKey, card, true), ANIM.battle.beforeDoubleAttack));
    return;
  }

  // 攻撃側は使用した1枚分、防御側は使用した防具枚数分だけ補充
  checkGameOver();
  if (state.over) { if (!isNoTurnAttack) closeBattleShowcase(); render(); return; }

  // ダメージ演出（シェイク・数字カウント等）が一段落してから新カードを手札に反映する
  // 「ターン消費なし」の攻撃（instant武器）はターンを渡さず、引き続き攻撃側の手番のままにする
  render();

  // 演出ステップ5（デメリット表示）まで含めて、増減演出キューが全部終わるのを待ってから
  // 最低限の余韻（600ms）を置いて演出モーダルを閉じる（キューが伸びても表示が途切れないようにする）
  const finishBattle = () => {
    if (!isNoTurnAttack) closeBattleShowcase();
    // バトルが完全に終わったので、上段中央パネルの背景固定を解除する
    unpinDetailArt();
    // 攻撃側・防御側とも、使った枚数分の補充は即座に行わず、それぞれ次に自分のターンが開始する時の
    // 手札整理フェイズ（捨てる→授かる演出）でまとめて行う（ターン消費なし攻撃で使った分もここに積んでおく）
    attacker.pendingRefill = (attacker.pendingRefill || 0) + 1 + (extraCardsUsed || 0);
    if (usedCount > 0) {
      defender.pendingRefill = (defender.pendingRefill || 0) + usedCount;
    }
    render();
    if (isNoTurnAttack) {
      // ターンは攻撃側のまま継続（本当のターン終了ではないので手札整理フェイズには入らない）。
      // 攻撃側がCPU（敵）なら、もう一手続けて打たせる
      if (attackerKey === 'enemy' && !state.over) {
        setTimeout(enemyTurnAct, ANIM.battle.enemyContinueAttack);
      }
    } else {
      // 本当にターンが終わるタイミングなので、次の手番（防御側）の手札整理フェイズに入ってからターンを渡す
      state.turn = defenderKey;
      tickStatusesAtTurnStart(defenderKey, state[defenderKey]);
      beginTurnStartStep(defenderKey);
    }
  };
  onStatEffectQueueEmpty(() => setTimeout(finishBattle, ANIM.battle.finishBattleHold));
}

function openDefenseModal() {
  const { card, usableArmors, defenderKey } = state.pendingDefense;

  // 中央パネルが数値演出で使用中の場合に備えて、防具のホバー詳細表示に確実に切り替える
  const statEffectPanel = document.getElementById('cardDetailStatEffect');
  if (statEffectPanel) statEffectPanel.style.display = 'none';

  // 相手の攻撃カード情報は、上段のカード詳細パネルにデフォルト表示しておく（防具ホバー時のみ切り替わる）
  showDefenseCardDetail(card);
  renderDefenseGrid();

  // 防御選択もデッキ（手札エリア）の中で行う。攻撃/回復の演出モーダルは開いたまま裏で待機させておく
  document.getElementById('handModeNormal').style.display = 'none';
  document.getElementById('handModeBattle').style.display = 'none';
  document.getElementById('handModeDefense').style.display = 'block';
}

function renderDefenseGrid() {
  const { defenderKey, usableArmors, selected } = state.pendingDefense;
  const defender = state[defenderKey];
  const grid = document.getElementById('defenseGrid');

  if (defender.hand.length === 0) {
    grid.innerHTML = `<div class="empty-hand">手札がない</div>`;
  } else {
    const withIdx = defender.hand.map((c, idx) => ({ c, idx }));
    // 通常デッキ表示と全く同じ並び順（種別→種別内の数値順）にする
    const items = withIdx.slice().sort((a, b) => compareHandCards(a.c, b.c));

    grid.innerHTML = items.map(({c, idx}) => {
      const armorItem = usableArmors.find(u => u.i === idx);
      const isUsable = !!armorItem;
      const isSelected = selected.includes(idx);
      return `
      <div class="card card-simplified type-${c.type} ${isSelected ? 'selected':''} ${!isUsable ? 'disabled' : ''} ${c.legend ? 'is-legend':''} ${bcCardClass(c)} ${itemCardClass(c)}" data-armoridx="${idx}">
        ${isSelected ? '<div class="selected-tag">選択中</div>' : ''}
        <div class="card-type-bar"></div>
        ${cardArtHtml(c)}
        ${legendSparkleHtml(c)}
        ${bcWatermarkHtml(c)}
        ${instantIconHtml(c)}
        ${cardTopLeftAttrHtml(c)}
        ${cardTopRightStatusHtml(c)}
        ${cardNameFooterHtml(c)}
        <div class="card-face">
          ${powerBadgeHtml(c, isUsable, armorItem ? armorItem.defenseMultiplier : 1)}
        </div>
      </div>
    `;
    }).join('');
    grid.querySelectorAll('.card').forEach(el => {
      const i = parseInt(el.dataset.armoridx);
      const c = defender.hand[i];
      const armorItem = usableArmors.find(u => u.i === i);
      el.addEventListener('mouseenter', () => showDefenseCardDetail(armorItem ? armorItem.c : c, !!armorItem, armorItem ? armorItem.defenseMultiplier : 1));
      el.addEventListener('mouseleave', () => showDefenseCardDetail(state.pendingDefense.card));
      el.addEventListener('touchstart', () => showDefenseCardDetail(armorItem ? armorItem.c : c, !!armorItem, armorItem ? armorItem.defenseMultiplier : 1), { passive: true });
      if (armorItem) {
        el.addEventListener('click', () => {
          const sel = state.pendingDefense.selected;
          const pos = sel.indexOf(i);
          if (pos !== -1) {
            // 既に選択済みのカードをもう一度クリックしたら選択解除
            sel.splice(pos, 1);
          } else if (hasStatus(defender, 'flash')) {
            // 閃光状態：防具は1枚しか選べない。既に1枚選んでいたら、そちらを外してこちらを選び直す
            if (sel.length > 0) {
              showActionTextOnly(defenderKey, '⚡閃光で1枚しか選べない！', 'status-flash');
            }
            sel.length = 0;
            sel.push(i);
          } else {
            sel.push(i);
          }
          renderDefenseGrid();
        });
      }
    });
  }
  updateDefenseConfirmBtn();
}

function updateDefenseConfirmBtn() {
  const btn = document.getElementById('takeDamageBtn');
  const sel = state.pendingDefense.selected;
  const defender = state[state.pendingDefense.defenderKey];
  if (sel.length > 0) {
    const totalDef = sel.reduce((sum, i) => {
      const found = state.pendingDefense.usableArmors.find(u => u.i === i);
      const c = found.c;
      const base = c.legend === 'mpDefense' ? defender.mp * 2 : ((typeof c.defense === 'number') ? c.defense : c.power);
      return sum + base * found.defenseMultiplier;
    }, 0);
    btn.textContent = `選択した${sel.length}枚で防御する（防${totalDef}）`;
    btn.classList.add('confirm-mode');
  } else {
    btn.textContent = '防御せず受ける';
    btn.classList.remove('confirm-mode');
  }
}

function closeDefenseModal() {
  document.getElementById('handModeDefense').style.display = 'none';
  document.getElementById('handModeBattle').style.display = 'block';
}

document.getElementById('takeDamageBtn').addEventListener('click', () => {
  const sel = state.pendingDefense ? state.pendingDefense.selected : [];
  finalizeDefense(sel);
});

/* ===================== 攻撃準備フェイズ（PLUSカード選択） ===================== */
function openAttackPrepModal() {
  const { who, card } = state.pendingAttack;
  const self = state[who];

  // 中央パネルが数値演出で使用中の場合に備えて、PLUSカードのホバー詳細表示に確実に切り替える
  const statEffectPanel = document.getElementById('cardDetailStatEffect');
  if (statEffectPanel) statEffectPanel.style.display = 'none';

  // 攻撃カード情報は、上段のカード詳細パネルにデフォルト表示しておく（PLUSカードホバー時のみ切り替わる）
  showAttackPrepCardDetail(card);
  renderAttackPrepGrid();

  // 攻撃準備もデッキ（手札エリア）の中で行う
  document.getElementById('handModeNormal').style.display = 'none';
  document.getElementById('handModeBattle').style.display = 'none';
  document.getElementById('handModeAttackPrep').style.display = 'block';
}

function renderAttackPrepGrid() {
  const { who, card: attackCard, plusIdxs } = state.pendingAttack;
  const self = state[who];
  const grid = document.getElementById('attackPrepGrid');
  // 選んだ攻撃カード自体も、選択中の見た目のまま手札一覧に混ぜて表示する
  // （実際には既に self.hand から取り除かれているが、見た目だけ残す）
  const handForDisplay = [attackCard, ...self.hand];
  const plusOptions = self.hand
    .map((c, i) => ({c, i}))
    .filter(({c}) => isPlusCard(c));

  if (handForDisplay.length === 0) {
    grid.innerHTML = `<div class="empty-hand">手札がない</div>`;
  } else {
    const withIdx = handForDisplay.map((c, idx) => ({ c, idx: idx === 0 ? -1 : idx - 1 }));
    // 通常デッキ表示と全く同じ並び順（種別→種別内の数値順）にする
    const items = withIdx.slice().sort((a, b) => compareHandCards(a.c, b.c));

    grid.innerHTML = items.map(({c, idx}) => {
      const isAttackCard = idx === -1;
      const isUsable = !isAttackCard && plusOptions.some(u => u.i === idx);
      const isSelected = isAttackCard || plusIdxs.includes(idx);
      return `
      <div class="card card-simplified type-${c.type} ${isSelected ? 'selected':''} ${!isUsable && !isAttackCard ? 'disabled' : ''} ${isAttackCard ? 'disabled' : ''} ${c.legend ? 'is-legend':''} ${bcCardClass(c)} ${itemCardClass(c)}" data-plusidx="${idx}">
        ${isSelected ? '<div class="selected-tag">選択中</div>' : ''}
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
      const i = parseInt(el.dataset.plusidx);
      const c = items[elIdx].c;
      const plusItem = i >= 0 ? plusOptions.find(u => u.i === i) : null;
      el.addEventListener('mouseenter', () => showAttackPrepCardDetail(plusItem ? plusItem.c : c));
      el.addEventListener('mouseleave', () => showAttackPrepCardDetail(state.pendingAttack.card));
      el.addEventListener('touchstart', () => showAttackPrepCardDetail(plusItem ? plusItem.c : c), { passive: true });
      if (plusItem) {
        el.addEventListener('click', () => {
          const sel = state.pendingAttack.plusIdxs;
          const pos = sel.indexOf(i);
          if (pos === -1) sel.push(i); else sel.splice(pos, 1);
          renderAttackPrepGrid();
        });
      }
    });
  }
  updateStartAttackBtn();
}

function updateStartAttackBtn() {
  const btn = document.getElementById('startAttackBtn');
  const { who, card, plusIdxs } = state.pendingAttack;
  const self = state[who];
  btn.textContent = '攻撃開始';

  // 見込み攻撃力（計算式は出さず、合計値だけ）を上段の合計値領域にリアルタイムで表示する
  const totalPlus = plusIdxs.reduce((sum, i) => sum + self.hand[i].plusBonus, 0);
  const basePower = card.power || 0;
  const previewPower = basePower + totalPlus;
  const el = document.getElementById(who === 'player' ? 'playerActionTotal' : 'enemyActionTotal');
  const topEl = document.getElementById(who === 'player' ? 'topPlayerActionTotal' : 'topEnemyActionTotal');
  const html = `<div class="action-total-num action-total-atk-preview"><span class="action-total-label">攻撃力</span><span class="action-total-value">${previewPower}</span></div>`;
  if (el) el.innerHTML = html;
  if (topEl) topEl.innerHTML = html;
}

// 攻撃準備フェイズも上段のカード詳細パネルを使い回す
function showAttackPrepCardDetail(c) {
  showCardDetail(c, null);
}

function closeAttackPrepModal(backToNormal) {
  document.getElementById('handModeAttackPrep').style.display = 'none';
  if (backToNormal) {
    document.getElementById('handModeNormal').style.display = 'block';
  } else {
    document.getElementById('handModeBattle').style.display = 'block';
  }
}
