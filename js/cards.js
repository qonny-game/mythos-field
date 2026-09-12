/* ============================================================
   cards.js — 神器（カード）データ専用ファイル

   新しいカードを追加したいときは、このファイルの
   CARDS 配列に1行足すだけでOK。他のファイルは触らなくていい。

   各カードの書き方（よく使うもの）:
     name    : カード名（表示される名前）
     myth    : 神話（北欧、エジプト、日本、ギリシャ、インド、共通）
     type    : "weapon"（武器・攻撃）/ "armor"（防具）/ "item"（雑貨） / "magic"（魔法・MPを消費して攻撃）/ "miracle"（奇跡）/ "trade"（取引）
     attr    : 属性（"火"/"水"/"木"/"土"/"光"/"闇"/"無"）。省略可
     power   : 攻撃力 or 防御力の数値
     effect  : カードの説明文（詳細パネルに出る）
     badge   : "bless"（幸）/ "curse"（呪）/ "legend"（伝）を付けるとカード全体が特別な色・透かし文字になる
     rare    : true にすると伝説プールなど特別枠に入る場合がある
     heal    : 雑貨カードの回復量。例 {hp:5} や {hp:3, mp:2}
     buyEffect: お金を払って使う雑貨。例 {cost:3, hp:3}

   --- ここから新しい書き方（自由に組み合わせOK） ---

     power: 7, plus: 3
       → 攻撃時だけ power + plus（=10）で計算される。
         plus は「攻撃力の上乗せ」専用。防御や回復には一切影響しない。
         （数字を入れなければ今まで通り。既存カードの plus:true / plus:false はこれとは別物として無視されるので書き換えなくて大丈夫）

     defense: 5
       → weapon（武器）カードでも、このフィールドを付ければ防御フェイズで防具として選べるようになる。
         防御時は defense の数値だけを見る（power や plus は無視）。
         「攻撃にも防御にも使える万能カード」を作れる。

     cost: { hp: 2, mp: 1, money: 3 }
       → カードを使うときに HP・MP・所持金を消費する。
         weapon / armor / item / miracle どのタイプでも使える。
         払えない分は省略してOK（例: cost:{mp:2} だけでも良い）。
         HPコストは「今のHPより多い金額」だと使用不可になる
         （自滅防止のため）。

     instant: true
       → このカードは使ってもターンが終わらない（もう一度好きなカードを選べる）。
       「次の防御でダメージ-3」のような、その場で効果だけ発生して手番を渡さないカードに向いている。

     tags: ["shield3"]
       → 実際の処理（効果の中身）をこのタグで指定する。
         今使えるタグ:
           "shieldN"（Nは数字）→ 次に自分が攻撃を受けたとき、
             ダメージをN軽減する（1回限り、防御時に消費される）
             例: tags:["shield3"] なら次のダメージ-3
         タグの中身は effect の説明文とは別に処理されるので、
         effect には人間向けの説明だけ書けばOK。

     plusBonus: 4
       → 「PLUSカード」専用フィールド。武器カードを選んで攻撃するとき、
         攻撃開始ボタンを押す前に手札から追加で選べる「攻撃力の上乗せ札」
         になる。type は item でも miracle でも何でもよく、
         plusBonus の数字がそのまま攻撃力に加算される。
         選ばなくてもいい（0枚でも攻撃できる）し、複数枚選んでもいい。

     castCostMp: 4 / castCostHp: 5 / castCostMoney: 3
       → 主に magic（魔法）や切り札級カードで使う発動コスト。
         足りない場合はカードそのものが選択不可（グレーアウト）になる。
         cost:{} と違って「代償」のニュアンスが強いカード向け。

     art: "img_card/dark_nyoru.jpg"
       → カードに絵を差し込みたいとき使う。index.html と同じ場所に
         card_img フォルダを置いて、その中に画像ファイルを入れ、
         ここには「img_card/ファイル名」の形で書けばよい。
         手札・演出などのカード表示にうっすら背景として敷かれ、
         カード詳細パネル（上段中央）にも少し薄く表示される。
         省略すれば今まで通り絵なしのまま。

   例（ターン消費なしの防御アイテム）:
     {name:"守りの札", myth:"共通", type:"item",
      effect:"合計3ダメージ分を防ぐ加護を得る（使い切るまで何ターンでも持続）",
      instant:true, tags:["shield3"]},

   例（攻撃にも防具にも使える万能武器）:
     {name:"竜の鱗剣", myth:"共通", type:"weapon", attr:"無",
      power:6, plus:2, defense:4,
      effect:"攻撃にも防御にも使える万能武器"},

   例（PLUSカード。攻撃準備フェイズで追加選択できる）:
     {name:"闘気の巻物", myth:"共通", type:"item",
      effect:"攻撃力+4のPLUSカード",
      plusBonus:4},
   ============================================================ */




   /* ============================================================
   cards.js — 神器（カード）データ専用ファイル
   ============================================================ */

const CARDS = [
  {name:"フレイの黄金の剣", myth:"北欧", type:"weapon", attr:"光", power:34, art:"img_card/1furei.jpg"},
  {name:"ロキの氷刃", myth:"北欧", type:"weapon", attr:"水", power:23, art:"img_card/2roki.jpg"},
  {name:"セクメトの獅子牙", myth:"エジプト", type:"weapon", attr:"無", power:14, art:"img_card/3sekumeto.jpg"},
  {name:"ホルスの隼の矢", myth:"エジプト", type:"weapon", attr:"無", power:25, art:"img_card/4horusu.jpg"},
  {name:"スサノオの十拳剣", myth:"日本", type:"weapon", attr:"木", power:24, art:"img_card/5susanoo.jpg"},
  {name:"ゼウスの雷霆ケラウノス", myth:"ギリシャ", type:"weapon", attr:"火", power:36, art:"img_card/6zeusu.jpg"},
  {name:"ポセイドンの三叉槍", myth:"ギリシャ", type:"weapon", attr:"水", power:15, art:"img_card/7poseidon.jpg"},
  {name:"アレスの戦槍", myth:"ギリシャ", type:"weapon", attr:"無", power:44, art:"img_card/8aresu.jpg"},
  {name:"シヴァの三叉槍トリシューラ", myth:"インド", type:"weapon", attr:"火", power:25, art:"img_card/9siva.jpg"},
  {name:"ヴィシュヌの円盤スダルシャナ", myth:"インド", type:"weapon", attr:"光", power:14, art:"img_card/10vishu.jpg"},
  {name:"アヌビスの魂刈り鎌", myth:"エジプト", type:"weapon", attr:"闇", power:13, art:"img_card/11anubisu.jpg"},
  {name:"ヤマタノオロチの毒牙", myth:"日本", type:"weapon", attr:"闇", power:12, art:"img_card/12orochi.jpg"},
  {name:"ハデスの兜の一撃", myth:"ギリシャ", type:"weapon", attr:"闇", power:12, art:"img_card/13hades.jpg"},
  {name:"カーリーの破壊の剣", myth:"インド", type:"weapon", attr:"闇", power:13, art:"img_card/14k-ri-.jpg"},

  {name:"もろかちこみアクス", myth:"", type:"weapon", attr:"無", power:25, art:"img_card/25morobukkomi_axe.jpg"},
  {name:"泣きっ面エルフ", myth:"", type:"weapon", attr:"無", power:20, art:"img_card/26elf_cryface.jpg"},
  {name:"南極知らずのドワーフ", myth:"", type:"weapon", attr:"無", power:20, art:"img_card/27dwarf_antarctica.jpg"},
  {name:"カカシ侍の抜刀", myth:"", type:"weapon", attr:"無", power:29, art:"img_card/29scarecrow_samurai.jpg"},
  {name:"荒ぶるマーモット", myth:"", type:"weapon", attr:"無", power:24, art:"img_card/31wild_marmot.jpg"},
  {name:"黄昏の石像", myth:"", type:"weapon", attr:"無", power:20, art:"img_card/32twilight_statue.jpg"},
  {name:"槍投げヘラクレス", myth:"", type:"weapon", attr:"無", power:22, art:"img_card/35hercules_javelin.jpg"},
  {name:"なぎなたプリンセス", myth:"", type:"weapon", attr:"無", power:25, art:"img_card/38naginata_princess.jpg"},
  {name:"ゴブリンバーテンダー", myth:"", type:"weapon", attr:"無", power:20, art:"img_card/45goblin_bartender.jpg"},

  {name:"猛毒の短剣", myth: "エジプト", type: "weapon", attr: "無", power: 5, inflictStatus: "poison" },
  {name:"混沌の刃", myth:"", type: "weapon", attr: "無", power:5 ,  inflictStatus: ["poison", "blind"] },
  {name:"メデューサビーム", myth:"", type:"weapon", attr:"無", power:5, art:"img_card/34medusa_beam.jpg" ,inflictStatus: "confusion"},
  {name:"サファイアボム", myth:"", type:"weapon", attr:"無", power:5, art:"img_card/37sapphire_bomb.jpg" ,inflictStatus: "flash"},
  {name:"ミラージュランス", myth:"", type:"weapon", attr:"無", power:5, art:"img_card/43mirage_lance.jpg" ,inflictStatus: "blind"},
  {name:"古代のロケットミサイル", myth:"", type:"weapon", attr:"無", power:5, art:"img_card/44ancient_rocket.jpg" ,inflictStatus: "curse"},
  {name:"ドラゴンゾンビの毒フレア", myth:"", type:"weapon", attr:"無", power:5, art:"img_card/48dragon_zombie_flare.jpg" ,inflictStatus: "poison"},

  {name:"彦星スターアタック", myth:"", type:"weapon", attr:"光", power:45, badge:"legend", rare:true, art:"img_card/40hikoboshi_attack.jpg"},
  {name:"乱れ切り・斬斬斬", myth:"", type:"weapon", attr:"光", power:40, badge:"legend", rare:true, art:"img_card/zanzanzan.jpg"},
  {name:"ライトニングダルマの突進", myth:"", type:"weapon", attr:"雷", power:35, badge:"legend", rare:true, art:"img_card/33lightning_daruma.jpg"},



  {name:"イグドラシルの樹皮鎧", myth:"北欧", type:"armor", attr:"木", power:5, art:"img_card/16yugu.jpg"},
  {name:"イシスの翼の盾", myth:"エジプト", type:"armor", attr:"水", power:6, art:"img_card/17isisu.jpg"},
  {name:"ガネーシャの護り", myth:"インド", type:"armor", attr:"無", power:7, art:"img_card/23gane.jpg"},
  {name:"オシリスの黄金仮面", myth:"エジプト", type:"armor", attr:"光", power:8, art:"img_card/18orisisu18.jpg"},
  {name:"ヤマタノオロチの鱗鎧", myth:"日本", type:"armor", attr:"火", power:9, art:"img_card/19orochi.jpg"},
  {name:"ツクヨミの月影マント", myth:"日本", type:"armor", attr:"闇", power:11, art:"img_card/20tsuku.jpg"},
  {name:"ミーミルの盾", myth:"北欧", type:"armor", attr:"無", power:12, art:"img_card/15mi-miru.jpg"},
  {name:"アテナのアイギスの盾", myth:"ギリシャ", type:"armor", attr:"光", power:13, art:"img_card/21atena.jpg"},
  {name:"ヘファイストスの青銅鎧", myth:"ギリシャ", type:"armor", attr:"土", power:14, art:"img_card/22hefa.jpg"},
  {name:"ラクシュミーの蓮の盾", myth:"インド", type:"armor", attr:"水", power:15, art:"img_card/24raku.jpg"},

  {name:"織姫バリア", myth:"", type:"armor", attr:"光", power:350, badge:"legend", rare:true, art:"img_card/41orihime_barrier.jpg"},
  {name:"フルパワー盾勇者", myth:"", type:"armor", attr:"無", power:20, badge:"legend", rare:true, art:"img_card/52fullpower_shieldhero.jpg"},


  {name:"ネズミの音楽隊", myth:"", type:"weapon", attr:"無", power:20, art:"img_card/30mouse_band.jpg"},
  {name:"幸運のトランプ", myth:"", type:"weapon", attr:"無", power:20, art:"img_card/36lucky_trump.jpg"},
  {name:"ウィッチのドキドキスロット", myth:"", type:"weapon", attr:"無", power:20, art:"img_card/42witch_slot.jpg"},
  {name:"スケルトンの骨の棚卸し", myth:"", type:"weapon", attr:"無", power:20, art:"img_card/50skeleton_inventory.jpg"},

  {name:"パンダ店長のラーメン", myth:"", type:"item", heal:{hp:30}, art:"img_card/46panda_ramen.jpg"},
  {name:"エナジーピザ", myth:"", type:"item", heal:{hp:25}, art:"img_card/39energy_pizza.jpg"},
  {name:"マジカルフラワーの甘梅雨", myth:"", type:"item", heal:{hp:20}, art:"img_card/47magical_flower_rain.jpg"},
  {name:"ワイトの禁呪実験", myth:"", type:"item", heal:{mp:30}, art:"img_card/49wight_experiment.jpg"},
  {name:"猫博士のラブポーション", myth:"", type:"item", heal:{mp:25}, tags:["shield20"], art:"img_card/51cat_doctor_love.jpg"},

  // 幸運系（ダメージ分HPを回復する）
  {name:"紅命の果断", myth:"北欧", type:"weapon", attr:"無", power:7, blessing:"lifesteal", effect:"与えたダメージ分HPを回復", badge:"bless", art:"img_card/1.jpg"},
  {name:"林檎牙の閃刃", myth:"北欧", type:"weapon", attr:"無", power:14, blessing:"lifesteal", effect:"与えたダメージ分HPを回復", badge:"bless", art:"img_card/1.jpg"},
  {name:"果樹王の破槌", myth:"北欧", type:"weapon", attr:"無", power:21, blessing:"lifesteal", effect:"与えたダメージ分HPを回復", badge:"bless", art:"img_card/1.jpg"},
  {name:"命果の神裂刀", myth:"北欧", type:"weapon", attr:"無", power:28, blessing:"lifesteal", effect:"与えたダメージ分HPを回復", badge:"bless", art:"img_card/1.jpg"},
  {name:"幸・トートの徴税剣", myth:"エジプト", type:"weapon", attr:"無", power:4, blessing:"moneysteal", effect:"与えたダメージ分お金を奪う", badge:"bless", art:"img_card/1.jpg"},
  {name:"幸・アテナの守護撃", myth:"ギリシャ", type:"weapon", attr:"無", power:4, blessing:"guard3", effect:"命中時、自分に護り+3を付与（次の被弾まで有効）", badge:"bless", art:"img_card/1.jpg"},
  {name:"幸・逆転の女神ニケ", myth:"ギリシャ", type:"weapon", attr:"無", power:15, blessing:"underdogAtk", effect:"自分のHPが相手より低いと攻撃力2倍", badge:"bless", art:"img_card/1.jpg"},
  {name:"幸・不屈のガネーシャ盾", myth:"インド", type:"armor", attr:"無", power:10, blessing:"underdogDef", effect:"自分のHPが相手より低いと防御力2倍", badge:"bless", art:"img_card/1.jpg"},

  {name:"ラーの光輪審判", myth:"エジプト", type:"miracle", cost:3, attr:"無", power:3, effect:"防御不可", badge:"bless", art:"img_card/1.jpg"},
  {name:"国譲りの交渉", myth:"日本", type:"miracle", cost:4, effect:"敵の所持金半分を奪う", steal:true, badge:"bless", art:"img_card/1.jpg"},
  {name:"パンドラの箱", myth:"ギリシャ", type:"miracle", cost:3, effect:"敵に状態異常付与", curse:true, badge:"bless", art:"img_card/1.jpg"},
  {name:"ヘルメスの俊足", myth:"ギリシャ", type:"miracle", cost:2, effect:"次の攻撃を1回自動回避", dodge:true, badge:"bless", art:"img_card/1.jpg"},

  {name:"トールの雷槌ミョルニル", myth:"北欧", type:"weapon", attr:"火", power:5, effect:"命中時20%でスタン", badge:"bless", art:"img_card/1.jpg"},
  {name:"槍グングニル", myth:"北欧", type:"weapon", attr:"無", power:6, effect:"必ず命中", badge:"bless", art:"img_card/1.jpg"},
  {name:"フレイヤの鎧ブリーシンガメン", myth:"北欧", type:"armor", attr:"無", power:2, effect:"装備中MP+1/T", badge:"bless", art:"img_card/1.jpg"},

  // 呪い系（ダメージの半分のHPを消費する）
  {name:"呪・ロキの背信剣", myth:"北欧", type:"weapon", attr:"闇", power:10, curse2:"halfBackfire", effect:"与えたダメージの半分が自分にも入る", badge:"curse", art:"img_card/1.jpg"},
  {name:"呪・アヌビスの禁呪剣", myth:"エジプト", type:"weapon", attr:"闇", power:20, curse2:"halfBackfire", effect:"与えたダメージの半分が自分にも入る", badge:"curse", art:"img_card/1.jpg"},
  {name:"呪・オロチの共食い牙", myth:"日本", type:"weapon", attr:"闇", power:30, curse2:"halfBackfire", effect:"与えたダメージの半分が自分にも入る", badge:"curse", art:"img_card/1.jpg"},
  {name:"呪・ダークシヴァ", myth:"魔神", type:"weapon", attr:"闇", power:10, curse2:"halfBackfire", effect:"与えたダメージの半分が自分にも入る", badge:"curse", art:"img_card/1.jpg"},
  {name:"呪・ダークミョルニル", myth:"魔神", type:"weapon", attr:"闇", power:15, curse2:"halfBackfire", effect:"与えたダメージの半分が自分にも入る", badge:"curse", art:"img_card/dark_nyoru.jpg"}, // 既存 art そのまま
  {name:"呪・ダークセト", myth:"魔神", type:"weapon", attr:"闇", power:20, curse2:"halfBackfire", effect:"与えたダメージの半分が自分にも入る", badge:"curse", art:"img_card/1.jpg"},
  {name:"呪・ダークヘラ", myth:"魔神", type:"weapon", attr:"闇", power:25, curse2:"halfBackfire", effect:"与えたダメージの半分が自分にも入る", badge:"curse", art:"img_card/1.jpg"},
  {name:"呪・ダークゼウス", myth:"魔神", type:"weapon", attr:"闇", power:30, curse2:"halfBackfire", effect:"与えたダメージの半分が自分にも入る", badge:"curse", art:"img_card/1.jpg"},
  {name:"呪・泥棒神ヴィシュヌ", myth:"インド", type:"weapon", attr:"闇", power:20, effect:"防御不可。ただし所持金を20失う", castCostMoney:20, badge:"curse", art:"img_card/curse1.jpg"}, // 既存 art そのまま



  // 捨て身系（HPを消費する）
  {name:"捨て身", myth:"共通", type:"weapon", attr:"無", power:14, effect:"HP5消費", castCostHp:5, art:"img_card/sutemi.jpg"},
  {name:"猪突猛進", myth:"共通", type:"weapon", attr:"無", power:20, effect:"HP8消費", castCostHp:8, art:"img_card/1.jpg"},
  {name:"嘆きの斧", myth:"魔神", type:"weapon", attr:"無", power:10, effect:"自身もHP5ダメージ", selfDamage:5, badge:"curse", art:"img_card/1.jpg"},
  {name:"絶望の鎌", myth:"魔神", type:"weapon", attr:"無", power:15, effect:"自身もHP7ダメージ", selfDamage:7, badge:"curse", art:"img_card/1.jpg"},
  {name:"悲観の弓", myth:"魔神", type:"weapon", attr:"無", power:20, effect:"自身もHP10ダメージ", selfDamage:10, badge:"curse", art:"img_card/1.jpg"},
  {name:"殺戮の剣", myth:"魔神", type:"weapon", attr:"無", power:25, effect:"自身もHP12ダメージ", selfDamage:12, badge:"curse", art:"img_card/1.jpg"},
  {name:"破壊の槍", myth:"魔神", type:"weapon", attr:"無", power:30, effect:"自身もHP15ダメージ", selfDamage:15, badge:"curse", art:"img_card/1.jpg"},

  // 魔法（MPを消費する）
  {name:"ファイア", myth:"共通", type:"magic", attr:"火", power:10, effect:"MP4消費", castCostMp:4, art:"img_card/fire1.jpg"},
  {name:"ボルガノン", myth:"共通", type:"magic", attr:"火", power:16, effect:"MP8消費", castCostMp:8, art:"img_card/fire1.jpg"},
  {name:"エクスプロージョン", myth:"共通", type:"magic", attr:"火", power:26, effect:"MP12消費", castCostMp:12, art:"img_card/fire1.jpg"},

  {name:"アイス", myth:"共通", type:"magic", attr:"水", power:10, effect:"MP4消費", castCostMp:4, art:"img_card/ice1.jpg"},
  {name:"ブリザード", myth:"共通", type:"magic", attr:"水", power:16, effect:"MP8消費", castCostMp:8, art:"img_card/ice1.jpg"},
  {name:"大津波", myth:"共通", type:"magic", attr:"水", power:26, effect:"MP12消費", castCostMp:12, art:"img_card/ice1.jpg"},

  {name:"ウインド", myth:"共通", type:"magic", attr:"木", power:10, effect:"MP4消費", castCostMp:4, art:"img_card/wind1.jpg"},
  {name:"突風", myth:"共通", type:"magic", attr:"木", power:16, effect:"MP8消費", castCostMp:8, art:"img_card/wind1.jpg"},
  {name:"トルネード", myth:"共通", type:"magic", attr:"木", power:26, effect:"MP12消費", castCostMp:12, art:"img_card/wind1.jpg"},

  {name:"ライトニング", myth:"共通", type:"magic", attr:"光", power:10, effect:"MP4消費", castCostMp:4, art:"img_card/hikari1.jpg"},
  {name:"ホーリーソード", myth:"共通", type:"magic", attr:"光", power:16, effect:"MP8消費", castCostMp:8, art:"img_card/hikari1.jpg"},
  {name:"シャイニング", myth:"共通", type:"magic", attr:"光", power:26, effect:"MP12消費", castCostMp:12, art:"img_card/hikari1.jpg"},


  // 伝説（最高レアリティ・極めて強力な効果）
  {name:"伝・双牙のフェンリル", myth:"北欧", type:"weapon", attr:"無", power:20, legend:"doubleAttack", effect:"1ターンに2回攻撃する", badge:"legend", rare:true, art:"img_card/leg4.jpg"},
  {name:"伝・オーディンの槍", myth:"北欧", type:"weapon", attr:"無", legend:"mpDamage", effect:"自分の現在MP×2のダメージを与える", badge:"legend", rare:true, art:"img_card/leg3.jpg"},
  {name:"伝・世界樹の絶対障壁", myth:"北欧", type:"armor", attr:"無", legend:"mpDefense", effect:"自分の現在MP×2の防御力を得る", badge:"legend", rare:true, art:"img_card/leg5.jpg"},
  {name:"伝・トートの完全なる封印", myth:"エジプト", type:"weapon", attr:"無", legend:"drainMp", effect:"相手のMPを0にする", badge:"legend", rare:true, art:"img_card/leg6.jpg"},
  {name:"伝・アテナの鏡の盾", myth:"ギリシャ", type:"armor", attr:"無", legend:"reflect", effect:"どんな攻撃も跳ね返す（自分は無傷）", badge:"legend", rare:true, art:"img_card/leg2.jpg"},
  {name:"伝・梵天の絶対結界", myth:"インド", type:"armor", attr:"無", legend:"nullify", effect:"どんな攻撃も無効化する", badge:"legend", rare:true, art:"img_card/leg1.jpg"},

  // 新システムの実例カード
  {name:"竜の鱗剣", myth:"共通", type:"weapon", attr:"無", power:6, plus:2, defense:4, effect:"攻撃にも防御にも使える万能武器（攻撃時power+plus、防御時はdefenseのみ）", art:"img_card/ryurin.jpg"},
  {name:"スカラベの護符", myth:"エジプト", type:"item", effect:"状態異常回復", heal:{"cure":true}, art:"img_card/1.jpg"},
  {name:"両替", myth:"共通", type:"trade", effect:"HP⇔MP⇔￥を自由に変換(各-2/+2)", art:"img_card/1.jpg"},

  // ターン消費無し
  {name:"生命の滴", myth:"共通", type:"item", effect:"ターンを消費することなくHP+5", heal:{hp:5}, instant:true, art:"img_card/1.jpg"},
  {name:"癒光の露", myth:"共通", type:"item", effect:"ターンを消費することなくHP+10", heal:{hp:10}, instant:true, art:"img_card/1.jpg"},
  {name:"毒吹き矢", myth:"共通", type:"weapon", attr:"無", power:5, effect:"ターンを消費することなく攻撃（防御不可）", instant:true, art:"img_card/1.jpg"},
  {name:"鋭針の一刺し", myth:"共通", type:"weapon", attr:"無", power:10, effect:"ターンを消費することなく攻撃（防御不可）", instant:true, art:"img_card/1.jpg"},
  {name:"影手裏剣", myth:"共通", type:"weapon", attr:"無", power:15, badge:"legend", effect:"ターンを消費することなく攻撃（防御不可）", instant:true, art:"img_card/1.jpg"},

  // 加護（次回ダメージ軽減）
  {name:"守りの札・参", myth:"共通", type:"item", effect:"合計3ダメージ分を防ぐ加護を得る（使い切るまで何ターンでも持続）", instant:true, tags:["shield3"], art:"img_card/mamori_san.jpg"},
  {name:"守りの札・伍", myth:"共通", type:"item", effect:"合計5ダメージ分を防ぐ加護を得る（使い切るまで何ターンでも持続）", instant:true, tags:["shield5"], art:"img_card/1.jpg"},
  {name:"守りの札・拾", myth:"共通", type:"item", effect:"合計10ダメージ分を防ぐ加護を得る（使い切るまで何ターンでも持続）", instant:true, tags:["shield10"], art:"img_card/1.jpg"},
  {name:"守りの札・拾伍", myth:"共通", type:"item", effect:"合計15ダメージ分を防ぐ加護を得る（使い切るまで何ターンでも持続）", instant:true, tags:["shield15"], art:"img_card/1.jpg"},
  {name:"守りの札・参拾", myth:"共通", type:"item", effect:"合計30ダメージ分を防ぐ加護を得る（使い切るまで何ターンでも持続）", instant:true, tags:["shield30"], art:"img_card/1.jpg"},





  // 攻撃強化
  {name:"力の護符", myth:"共通", type:"item", effect:"攻撃準備フェイズで選べるPLUSカード（攻撃力+6）", plusBonus:5, art:"img_card/1.jpg"},
  {name:"闘気の巻物", myth:"共通", type:"item", effect:"攻撃準備フェイズで選べるPLUSカード（攻撃力+12）", plusBonus:10, art:"img_card/1.jpg"},
  {name:"覇気の宝珠", myth:"共通", type:"item", effect:"攻撃準備フェイズで選べるPLUSカード（攻撃力+18）", plusBonus:15, rare:true, art:"img_card/1.jpg"},
  {name:"猫商人の秘薬", myth:"共通", type:"item", plusBonus:25, art:"img_card/28cat_merchant_elixir.jpg"},

  // 回復（お金消費なし・段階別）
  {name:"癒しの雫・小", myth:"共通", type:"item", effect:"HP+5", heal:{hp:5}, art:"img_card/hp1.jpg"},
  {name:"癒しの雫・中", myth:"共通", type:"item", effect:"HP+10", heal:{hp:10}, art:"img_card/hp2.jpg"},
  {name:"癒しの雫・大", myth:"共通", type:"item", effect:"HP+15", heal:{hp:15}, art:"img_card/hp3.jpg"},
  {name:"癒しの秘薬・小", myth:"共通", type:"item", effect:"HP+20", heal:{hp:20}, art:"img_card/hp4.jpg"},
  {name:"癒しの秘薬・中", myth:"共通", type:"item", effect:"HP+25", heal:{hp:25}, art:"img_card/hp5.jpg"},
  {name:"癒しの秘薬・大", myth:"共通", type:"item", effect:"HP+30", heal:{hp:30}, art:"img_card/hp6.jpg"},
  {name:"魔力の雫・小", myth:"共通", type:"item", effect:"MP+5", heal:{mp:5}, art:"img_card/mp1.jpg"},
  {name:"魔力の雫・中", myth:"共通", type:"item", effect:"MP+10", heal:{mp:10}, art:"img_card/mp2.jpg"},
  {name:"魔力の雫・大", myth:"共通", type:"item", effect:"MP+15", heal:{mp:15}, art:"img_card/mp3.jpg"},
  {name:"魔力の秘薬・小", myth:"共通", type:"item", effect:"MP+20", heal:{mp:20}, art:"img_card/mp4.jpg"},
  {name:"魔力の秘薬・中", myth:"共通", type:"item", effect:"MP+25", heal:{mp:25}, art:"img_card/mp5.jpg"},
  {name:"魔力の秘薬・大", myth:"共通", type:"item", effect:"MP+30", heal:{mp:30}, art:"img_card/mp6.jpg"},

  // 伝説の回復（お金消費なし・段階別）
  {name:"完全なる癒し", myth:"共通", type:"item", effect:"HP+50", heal:{hp:50}, badge:"legend", rare:true, art:"img_card/hp6.jpg"},
  {name:"完全なる魔力", myth:"共通", type:"item", effect:"MP+50", heal:{mp:50}, badge:"legend", rare:true, art:"img_card/mp6.jpg"},
];






