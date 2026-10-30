/* 掼蛋规则引擎 v0.1 —— 牌型判定 / 大小比较 / 出牌生成
 * 家族约定：一期核心牌型 + 简化进贡；逢人配（级牌百搭）二期。
 * 牌对象：{s:'D'|'C'|'H'|'S'|'J', r:'3'..'9'|'10'|'J'|'Q'|'K'|'A'|'2'|'x'|'b'}（s='J' 为王，r='x' 小王 'b' 大王）
 */
(function (global) {
  "use strict";

  var SUITS = ["D", "C", "H", "S"];
  var RANKS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
  var RANK_ORDER = { "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14 };

  function orderOf(card, level) {
    if (card.s === "J") return card.r === "b" ? 18 : 17;
    if (card.r === "2") return 15;
    if (card.r === level) return 16;
    return RANK_ORDER[card.r];
  }

  function makeDeck(level) {
    var deck = [];
    for (var d = 0; d < 2; d++) {
      SUITS.forEach(function (s) {
        RANKS.forEach(function (r) { deck.push({ s: s, r: r }); });
      });
    }
    deck.push({ s: "J", r: "x" }, { s: "J", r: "x" }, { s: "J", r: "b" }, { s: "J", r: "b" });
    return deck;
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function cardId(c) { return c.s + c.r; }

  function isSeqRanks(orders) { // 连续且都在 3..A（级牌/2/王已在调用处排除）
    for (var i = 1; i < orders.length; i++) if (orders[i] !== orders[i - 1] + 1) return false;
    return true;
  }

  function groupByOrder(cards, level) {
    var g = {};
    cards.forEach(function (c) {
      var o = orderOf(c, level);
      (g[o] = g[o] || []).push(c);
    });
    return g;
  }

  /* 分类一手牌：返回 {type, key, w, n} 或 null
   * type: single/pair/triple/triple2/straight/flush/pairs(连对)/plate(钢板)/bomb/jokerbomb
   * w: 权重（普通0，同花顺5.5，炸弹=张数，三王7.5 四王8） */
  function classify(cards, level) {
    var n = cards.length;
    if (!n) return null;
    var g = groupByOrder(cards, level);
    var orders = Object.keys(g).map(Number).sort(function (a, b) { return a - b; });
    var jokers = cards.filter(function (c) { return c.s === "J"; });
    var i;

    if (n === 1) return { type: "single", key: orders[0], w: 0, cnt: 1 };
    if (n === 2 && orders.length === 1) return { type: "pair", key: orders[0], w: 0, cnt: 2 };
    if (n === 3 && orders.length === 1) return { type: "triple", key: orders[0], w: 0, cnt: 3 };

    // 王炸弹（3 或 4 张王）
    if (jokers.length === n && n >= 3) return { type: "jokerbomb", key: 18, w: n === 4 ? 8 : 7.5, cnt: n };

    // 普通炸弹：4 张以上同点（含级牌、2）
    if (orders.length === 1 && n >= 4) return { type: "bomb", key: orders[0], w: n, cnt: n };

    // 三带二：三张 + 另一组对子
    if (n === 5 && orders.length === 2) {
      var a = g[orders[0]].length, b = g[orders[1]].length;
      if ((a === 3 && b === 2) || (a === 2 && b === 3)) {
        var k = a === 3 ? orders[0] : orders[1];
        return { type: "triple2", key: k, w: 0, cnt: 5 };
      }
      return null;
    }

    // 顺子 / 同花顺：恰好 5 张连续，只能用 3..A（排除级牌），王/2 自动排除
    if (n === 5 && orders.length === 5 && orders[0] >= 3 && orders[4] <= 14 && orders[4] !== 16) {
      var lv = orderOf({ s: "D", r: level }, level);
      if (orders.indexOf(lv) !== -1) return null;
      if (!isSeqRanks(orders)) return null;
      var suit = cards[0].s, same = cards.every(function (c) { return c.s === suit; });
      if (same && suit !== "J") return { type: "flush", key: orders[4], w: 5.5, cnt: 5 };
      return { type: "straight", key: orders[4], w: 0, cnt: 5 };
    }

    // 连对：3 对以上连续（排除级牌/2/王）
    if (orders.length === n / 2 && n >= 6 && n % 2 === 0) {
      var okP = orders.every(function (o) { return g[o].length === 2; });
      if (okP && orders[0] >= 3 && orders[orders.length - 1] <= 14 && orders.indexOf(orderOf({ s: "D", r: level }, level)) === -1 && isSeqRanks(orders))
        return { type: "pairs", key: orders[orders.length - 1], w: 0, n: orders.length, cnt: n };
      return null;
    }

    // 钢板：2 组以上连续三张（排除级牌/2/王）
    if (orders.length === n / 3 && n >= 6 && n % 3 === 0) {
      var okT = orders.every(function (o) { return g[o].length === 3; });
      if (okT && orders[0] >= 3 && orders[orders.length - 1] <= 14 && orders.indexOf(orderOf({ s: "D", r: level }, level)) === -1 && isSeqRanks(orders))
        return { type: "plate", key: orders[orders.length - 1], w: 0, n: orders.length, cnt: n };
      return null;
    }
    return null;
  }

  function beats(play, trick) {
    if (!trick) return true;
    var t = trick.play || trick; // 兼容 {cards, play} 包装和裸 play
    if (play.w !== t.w) return play.w > t.w;
    if (play.type !== t.type) return false; // 同权重不同型（如 flush vs flush 之外不会出现）
    return play.key > t.key;
  }

  /* ---------- 出牌生成 ---------- */
  function sig(cards) {
    return cards.map(cardId).sort().join(",");
  }
  function byOrderAsc(a, b, level) { return orderOf(a, level) - orderOf(b, level); }

  function pickCombos(cards, k, level, mk) { // 从每个点数组里选牌组成 mk 型，通用小工具不适用，单独写
    return null;
  }

  // 生成所有跟牌选项（同型更大 + 所有更大炸弹/同花顺）
  function responses(hand, trick, level) {
    var out = [], seen = {};
    function push(cards) {
      var p = classify(cards, level);
      if (!p || !beats(p, trick)) return;
      var s = sig(cards);
      if (seen[s]) return;
      seen[s] = 1;
      out.push({ cards: cards, play: p });
    }
    var g = groupByOrder(hand, level);
    var orders = Object.keys(g).map(Number).sort(function (a, b) { return a - b; });
    var lvOrder = orderOf({ s: "D", r: level }, level);
    var t = trick.play || trick;
    var i, j, k;

    if (t.type === "single") {
      orders.forEach(function (o) { push([g[o][0]]); });
    } else if (t.type === "pair" || t.type === "triple" || t.type === "bomb") {
      orders.forEach(function (o) {
        if (o > t.key && g[o].length >= t.cnt) push(g[o].slice(0, t.cnt));
      });
    } else if (t.type === "triple2") {
      orders.forEach(function (o) {
        if (o <= t.key || g[o].length < 3) return;
        var others = orders.filter(function (x) { return x !== o && g[x].length >= 2; });
        others.forEach(function (x) { push(g[o].slice(0, 3).concat(g[x].slice(0, 2))); });
      });
    } else if (t.type === "straight" || t.type === "flush") {
      for (var st = 3; st + 4 <= 14; st++) {
        var need = [st, st + 1, st + 2, st + 3, st + 4];
        if (need[4] <= t.key) continue;
        var chosen = [], bad = false;
        for (i = 0; i < 5; i++) {
          var o = need[i];
          if (o === lvOrder || !g[o] || !g[o].length) { bad = true; break; }
          chosen.push(g[o][0]);
        }
        if (bad) continue;
        if (t.type === "straight") push(chosen);
        else {
          // 同花顺：5 张同花色
          SUITS.forEach(function (s2) {
            var fc = [], okF = true;
            for (i = 0; i < 5; i++) {
              var c = g[need[i]].find(function (x) { return x.s === s2; });
              if (!c) { okF = false; break; }
              fc.push(c);
            }
            if (okF) push(fc);
          });
        }
      }
    } else if (t.type === "pairs") {
      var tn = t.n;
      for (var s0 = 3; s0 + tn - 1 <= 14; s0++) {
        if (s0 + tn - 1 <= t.key) continue;
        var pc = [], okP = true;
        for (i = 0; i < tn; i++) {
          var o2 = s0 + i;
          if (o2 === lvOrder || !g[o2] || g[o2].length < 2) { okP = false; break; }
          pc = pc.concat(g[o2].slice(0, 2));
        }
        if (okP) push(pc);
      }
    } else if (t.type === "plate") {
      var tn2 = t.n;
      for (var s1 = 3; s1 + tn2 - 1 <= 14; s1++) {
        if (s1 + tn2 - 1 <= t.key) continue;
        var tc = [], okT = true;
        for (i = 0; i < tn2; i++) {
          var o3 = s1 + i;
          if (o3 === lvOrder || !g[o3] || g[o3].length < 3) { okT = false; break; }
          tc = tc.concat(g[o3].slice(0, 3));
        }
        if (okT) push(tc);
      }
    }

    // 更大的炸弹 / 同花顺 / 王炸弹
    var tW = t.w;
    orders.forEach(function (o) {
      if (o === 17 || o === 18) return;
      if (g[o].length >= 4 && g[o].length > tW) push(g[o].slice(0, g[o].length));
    });
    var jc = hand.filter(function (c) { return c.s === "J"; });
    if (jc.length >= 3 && tW < 7.5) push(jc.slice(0, 3));
    if (jc.length === 4) push(jc);
    if (tW < 5.5) {
      for (var st2 = 3; st2 + 4 <= 14; st2++) {
        SUITS.forEach(function (s2) {
          var fc = [], okF = true;
          for (i = 0; i < 5; i++) {
            var c = g[st2 + i] && g[st2 + i].find(function (x) { return x.s === s2; });
            if (!c) { okF = false; break; }
            fc.push(c);
          }
          if (okF) push(fc);
        });
      }
    }
    return out;
  }

  // 生成所有可出的领出组合
  function allPlays(hand, level) {
    var out = [], seen = {};
    function push(cards) {
      var p = classify(cards, level);
      if (!p) return;
      var s = sig(cards);
      if (seen[s]) return;
      seen[s] = 1;
      out.push({ cards: cards, play: p });
    }
    var g = groupByOrder(hand, level);
    var orders = Object.keys(g).map(Number).sort(function (a, b) { return a - b; });
    var lvOrder = orderOf({ s: "D", r: level }, level);
    var i, s2;

    orders.forEach(function (o) {
      g[o].forEach(function (c) { push([c]); });
      if (g[o].length >= 2) push(g[o].slice(0, 2));
      if (g[o].length >= 3) push(g[o].slice(0, 3));
      if (g[o].length >= 4) push(g[o].slice(0, g[o].length));
    });
    orders.forEach(function (o) {
      if (g[o].length >= 3) {
        orders.forEach(function (x) {
          if (x !== o && g[x].length >= 2) push(g[o].slice(0, 3).concat(g[x].slice(0, 2)));
        });
      }
    });
    for (var st = 3; st + 4 <= 14; st++) {
      var chosen = [], ok = true;
      for (i = 0; i < 5; i++) {
        var o2 = st + i;
        if (o2 === lvOrder || !g[o2]) { ok = false; break; }
        chosen.push(g[o2][0]);
      }
      if (ok) push(chosen);
      SUITS.forEach(function (su) {
        var fc = [], okF = true;
        for (i = 0; i < 5; i++) {
          var c = g[st + i] && g[st + i].find(function (x) { return x.s === su; });
          if (!c) { okF = false; break; }
          fc.push(c);
        }
        if (okF) push(fc);
      });
    }
    for (var p0 = 3; p0 + 2 <= 14; p0++) { // 连对 3 对起
      for (var len = 3; p0 + len - 1 <= 14; len++) {
        var pc = [], okP = true;
        for (i = 0; i < len; i++) {
          var o3 = p0 + i;
          if (o3 === lvOrder || !g[o3] || g[o3].length < 2) { okP = false; break; }
          pc = pc.concat(g[o3].slice(0, 2));
        }
        if (okP) push(pc);
      }
    }
    for (var t0 = 3; t0 + 1 <= 14; t0++) { // 钢板 2 组起
      for (var len2 = 2; t0 + len2 - 1 <= 14; len2++) {
        var tc = [], okT = true;
        for (i = 0; i < len2; i++) {
          var o4 = t0 + i;
          if (o4 === lvOrder || !g[o4] || g[o4].length < 3) { okT = false; break; }
          tc = tc.concat(g[o4].slice(0, 3));
        }
        if (okT) push(tc);
      }
    }
    return out;
  }


  /* ---------- 进贡/还贡/抗贡（官方 2025 规则，2026-10-30 参考 GuanDan Lab 补课） ---------- */
  // 红桃级牌（逢人配）：不进贡、不能还贡
  function isHongTaoLevel(card, level) { return card.s === "H" && card.r === level; }
  // 进贡牌：手中最大一张（红桃级牌除外；全为红桃级牌时退而进最大一张）
  function tributeCard(hand, level) {
    var pool = hand.filter(function (c) { return !isHongTaoLevel(c, level); });
    if (!pool.length) pool = hand.slice();
    var best = pool[0];
    for (var i = 1; i < pool.length; i++) if (orderOf(pool[i], level) > orderOf(best, level)) best = pool[i];
    return best;
  }
  // 抗贡：进贡方合计两个及以上大王
  function canKangGong(payerSeats, hands) {
    var n = 0;
    payerSeats.forEach(function (s) {
      hands[s].forEach(function (c) { if (c.s === "J" && c.r === "b") n++; });
    });
    return n >= 2;
  }
  // 还贡牌：≤10 且非红桃级牌里最小的一张；全 >10 则还最小的牌
  function returnCard(hand, level) {
    var ok = hand.filter(function (c) { return !isHongTaoLevel(c, level) && orderOf(c, level) <= 10; });
    if (!ok.length) ok = hand.filter(function (c) { return !isHongTaoLevel(c, level); });
    if (!ok.length) ok = hand.slice();
    var min = ok[0];
    for (var i = 1; i < ok.length; i++) if (orderOf(ok[i], level) < orderOf(min, level)) min = ok[i];
    return min;
  }
  // 手牌可否还此牌：≤10 且非红桃级牌
  function validReturn(card, level) {
    return !isHongTaoLevel(card, level) && orderOf(card, level) <= 10;
  }
  // 双贡配对：头游的进贡者 = 头游下家优先（同点规则），否则取牌点大的；另一家给二游
  function pairDoubleTribute(tou, erYou, payers, hands, level) {
    var nextOfTou = (tou + 1) % 4;
    var a = payers[0], b = payers[1];
    if (b === nextOfTou) { a = payers[1]; b = payers[0]; }
    else if (a !== nextOfTou) {
      // 都不是头游下家：点数大的进给头游
      var big = orderOf(tributeCard(hands[payers[0]], level), level) >= orderOf(tributeCard(hands[payers[1]], level), level);
      a = big ? payers[0] : payers[1];
      b = a === payers[0] ? payers[1] : payers[0];
    }
    return [{ payer: a, receiver: tou }, { payer: b, receiver: erYou }];
  }

  global.GuanDanRules = {
    SUITS: SUITS, RANKS: RANKS,
    orderOf: orderOf, makeDeck: makeDeck, shuffle: shuffle,
    classify: classify, beats: beats, responses: responses, allPlays: allPlays,
    tributeCard: tributeCard, canKangGong: canKangGong, returnCard: returnCard, validReturn: validReturn, isHongTaoLevel: isHongTaoLevel, pairDoubleTribute: pairDoubleTribute,
    cardId: cardId
  };
})(window);
