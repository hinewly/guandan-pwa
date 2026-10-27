/* 掼蛋 AI v0.1 —— 启发式出牌（能压就压 / 队友放行 / 炸弹惜用） */
(function (global) {
  "use strict";
  var R = global.GuanDanRules;

  function cardCost(order) {
    if (order >= 17) return 40;           // 王
    if (order === 16) return 25;          // 级牌
    if (order === 15) return 12;          // 2
    return order - 3;
  }

  function costOf(play, cards, level) {
    var c = 0;
    cards.forEach(function (card) { c += cardCost(R.orderOf(card, level)); });
    // 拆炸弹/王惩罚
    var g = {};
    cards.forEach(function (card) {
      var o = R.orderOf(card, level);
      g[o] = (g[o] || 0) + 1;
    });
    Object.keys(g).forEach(function (o) {
      if (g[o] >= 4) c += 50; // 这手牌本身含炸弹组则惩罚
    });
    return c;
  }

  /* 出牌决策：返回 {cards, play} 或 null（不出/过） */
  function decide(hand, trick, level, ctx) {
    ctx = ctx || {};
    if (!trick) return lead(hand, level);
    return follow(hand, trick, level, ctx);
  }

  /* 领出：优先甩小牌 + 多张组合；炸弹/王炸弹留后 */
  function lead(hand, level) {
    var plays = R.allPlays(hand, level);
    if (!plays.length) return null;
    var normal = plays.filter(function (p) { return p.play.w === 0; });
    var pool = normal.length ? normal : plays;
    var best = null, bestScore = Infinity;
    pool.forEach(function (p) {
      var sum = 0;
      p.cards.forEach(function (c) { sum += R.orderOf(c, level); });
      var score = sum / p.cards.length - 0.12 * p.cards.length;
      // 尾张效应：正好出完直接加分
      if (p.cards.length === hand.length) score -= 20;
      if (score < bestScore) { bestScore = score; best = p; }
    });
    return best;
  }

  /* 跟牌：同型最小代价 → 对手在赢且非残局才动炸弹 */
  function follow(hand, trick, level, ctx) {
    var plays = R.responses(hand, trick, level);
    if (!plays.length) return null;
    var t = trick.play || trick;
    var sameType = plays.filter(function (p) { return p.play.type === t.type && p.play.w === t.w; });
    var winnerSeat = ctx.trickWinnerSeat;
    var mySeat = ctx.mySeat;
    var winnerIsPartner = ctx.partnerSeat != null && winnerSeat === ctx.partnerSeat;

    // 队友在赢：只在超低成本时锦上添花（比如顺一手小单张）
    if (winnerIsPartner) {
      var cheap = sameType.filter(function (p) {
        return costOf(p.play, p.cards, level) <= 4 && t.type === "single";
      });
      return cheap.length ? cheap[0] : null;
    }

    // 对手在赢：出同型最小牌
    if (sameType.length) {
      sameType.sort(function (a, b) { return costOf(a.play, a.cards, level) - costOf(b.play, b.cards, level); });
      var pick = sameType[0];
      // 高价牌（王/级牌）跟单张要掂量：如果对手只剩很少的牌就压
      var c = costOf(pick.play, pick.cards, level);
      if (c <= 12 || (ctx.opponentCardsLeft != null && ctx.opponentCardsLeft <= 4)) return pick;
      // 太贵就考虑炸弹或过
      var bombs = plays.filter(function (p) { return p.play.w > 0; });
      if (bombs.length && ctx.opponentCardsLeft != null && ctx.opponentCardsLeft <= 6) {
        bombs.sort(function (a, b) { return a.play.w - b.play.w; });
        return bombs[0];
      }
      return null;
    }

    // 只剩炸弹能压：对手在赢、自己牌不少于对手一半时才舍得炸
    var bombOnly = plays.filter(function (p) { return p.play.w > 0; });
    if (!bombOnly.length) return null;
    bombOnly.sort(function (a, b) { return a.play.w - b.play.w; });
    var myLeft = hand.length;
    var oppLeft = ctx.opponentCardsLeft == null ? 27 : ctx.opponentCardsLeft;
    if (myLeft <= oppLeft + 2 || oppLeft <= 4) return bombOnly[0]; // 接近收官敢炸
    return Math.random() < 0.35 ? bombOnly[0] : null;             // 中盘有概率炸
  }

  global.GuanDanAI = { decide: decide };
})(window);
