/* 掼蛋 PWA 主控 v0.1.0 */
(function () {
  "use strict";
  var R = window.GuanDanRules;
  var AI = window.GuanDanAI;
  var APP_VERSION = "v0.1.0";
  var SAVE_KEY = "dbguandan-save-v1";
  var LEVEL_SEQ = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  var SUIT_SYM = { D: "♦", C: "♣", H: "♥", S: "♠" };
  var SEAT_NAMES = ["你（南）", "东家", "队友（北）", "西家"];
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 状态 ---------- */
  var state = null;
  var selected = new Set();   // 手牌索引
  var hintIdx = 0;
  var aiTimer = null;
  var locked = false;

  function freshState() {
    return {
      v: 1,
      handNum: 1,
      levelTeam0: "2", // 我方（南+北）
      levelTeam1: "2", // 对方（东+西）
      hands: [[], [], [], []],
      turn: 0,
      leaderSeat: 0,
      trick: null,          // {cards, play, seat, passes}
      table: [null, null, null, null], // 本墩各家亮出的牌
      passFlags: [false, false, false, false],
      finishOrder: [],
      nextLeader: 0,
      matchOver: false
    };
  }

  function teamOf(seat) { return seat % 2 === 0 ? 0 : 1; }
  function partnerOf(seat) { return (seat + 2) % 4; }
  function levelOf(team) { return team === 0 ? state.levelTeam0 : state.levelTeam1; }
  function nextLevelChar(lv) {
    var i = LEVEL_SEQ.indexOf(lv);
    return i < 0 || i >= LEVEL_SEQ.length - 1 ? null : LEVEL_SEQ[i + 1];
  }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {} }
  function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && s.v === 1) return s;
    } catch (e) {}
    return null;
  }

  /* ---------- 开局 / 发牌 ---------- */
  function startHand() {
    var deck = R.shuffle(R.makeDeck(state.levelTeam0));
    for (var s = 0; s < 4; s++) {
      state.hands[s] = deck.slice(s * 27, (s + 1) * 27);
      sortHand(state.hands[s]);
    }
    state.trick = null;
    state.table = [null, null, null, null];
    state.passFlags = [false, false, false, false];
    state.finishOrder = [];
    state.turn = state.nextLeader;
    state.leaderSeat = state.nextLeader;
    selected.clear();
    hintIdx = 0;
    log("第 " + state.handNum + " 局开始，当前级别：我方 " + state.levelTeam0 + " / 对方 " + state.levelTeam1 + "。" + SEAT_NAMES[state.turn] + "先出。");
    save();
    render();
    scheduleAI();
  }

  function sortHand(hand) {
    hand.sort(function (a, b) {
      var oa = R.orderOf(a, state.levelTeam0), ob = R.orderOf(b, state.levelTeam0);
      if (ob !== oa) return ob - oa;
      return (a.s + a.r).localeCompare(b.s + b.r);
    });
  }

  /* ---------- 出牌 / 过牌 ---------- */
  function doPlay(seat, cards) {
    var hand = state.hands[seat];
    var play = R.classify(cards, state.levelTeam0);
    if (!play) return false;
    if (state.trick && !R.beats(play, state.trick)) return false;
    // 从手牌移除
    var ids = cards.map(function (c) { return c.s + c.r; });
    for (var i = hand.length - 1; i >= 0; i--) {
      var idx = ids.indexOf(hand[i].s + hand[i].r);
      if (idx !== -1) { ids.splice(idx, 1); hand.splice(i, 1); }
    }
    state.table[seat] = cards;
    state.passFlags = [false, false, false, false];
    state.trick = { cards: cards, play: play, seat: seat, passes: 0 };
    log(SEAT_NAMES[seat] + " 出 " + playText(cards, play));
    if (hand.length === 0 && state.finishOrder.indexOf(seat) === -1) {
      state.finishOrder.push(seat);
      log("🎉 " + SEAT_NAMES[seat] + " 打完！（第 " + state.finishOrder.length + " 名）");
    }
    if (state.finishOrder.length >= 3) { endHand(); return true; }
    state.turn = nextAlive(seat);
    save();
    render();
    scheduleAI();
    return true;
  }

  function doPass(seat) {
    if (!state.trick || state.trick.seat === seat) return;
    state.trick.passes++;
    state.passFlags[seat] = true;
    state.table[seat] = null;
    log(SEAT_NAMES[seat] + " 要不起");
    var nt = nextAlive(seat);
    // 三家全过，或回合转回到当前赢墩者（有人打完后跳过时可能不足三家），都收墩
    if (state.trick.passes >= 3 || nt === state.trick.seat) {
      var winner = state.trick.seat;
      state.table = [null, null, null, null];
      state.trick = null;
      selected.clear();
      if (state.hands[winner].length > 0) {
        state.turn = winner;
        log("— " + SEAT_NAMES[winner] + " 赢得本轮，继续出牌 —");
      } else {
        state.turn = nextAlive(winner);
      }
    } else {
      state.turn = nt;
    }
    save();
    render();
    scheduleAI();
  }

  function nextAlive(from) {
    for (var i = 1; i <= 4; i++) {
      var s = (from + i) % 4;
      if (state.hands[s].length > 0) return s;
    }
    return from;
  }

  /* ---------- 一局结束 ---------- */
  function endHand() {
    // 末游自动补齐
    for (var s = 0; s < 4; s++) if (state.finishOrder.indexOf(s) === -1) state.finishOrder.push(s);
    var tou = state.finishOrder[0];
    var winTeam = teamOf(tou);
    var doubleDown = teamOf(state.finishOrder[1]) === winTeam;
    var delta = doubleDown ? 3 : 2;
    var lv = levelOf(winTeam);
    var nl = null;
    var matchOver = false;
    if (lv === "A") {
      matchOver = true;
    } else {
      nl = nextLevelChar(lv);
      if (winTeam === 0) state.levelTeam0 = nl; else state.levelTeam1 = nl;
    }
    state.nextLeader = tou;
    state.handNum++;
    state.matchOver = matchOver;
    save();
    showResult(winTeam, delta, doubleDown, matchOver);
  }

  function showResult(winTeam, delta, doubleDown, matchOver) {
    var box = $("result-modal");
    $("result-title").textContent = matchOver
      ? (winTeam === 0 ? "🏆 通关！我方打到 A！" : "对方通关，本盘失利")
      : (winTeam === 0 ? "我方胜！" : "对方胜");
    var lines = [];
    var order = state.finishOrder.map(function (s) { return SEAT_NAMES[s]; }).join(" → ");
    lines.push("打完顺序：" + order);
    lines.push(doubleDown ? "双下！升 " + delta + " 级" : "升 " + delta + " 级");
    if (!matchOver) lines.push("下一局：我方 " + state.levelTeam0 + " / 对方 " + state.levelTeam1 + " 级");
    $("result-body").innerHTML = lines.map(function (l) { return "<p>" + l + "</p>"; }).join("");
    $("btn-next-hand").textContent = matchOver ? "再来一盘（重置 2 级）" : "下一局";
    box.classList.remove("hidden");
  }

  /* ---------- AI 调度 ---------- */
  function scheduleAI() {
    clearTimeout(aiTimer);
    if (state.matchOver || locked) return;
    var seat = state.turn;
    if (seat === 0) return; // 人类
    aiTimer = setTimeout(function () {
      if (!state || state.turn !== seat || state.matchOver || locked) return;
      var hand = state.hands[seat];
      var ctx = {
        mySeat: seat,
        partnerSeat: partnerOf(seat),
        trickWinnerSeat: state.trick ? state.trick.seat : null,
        opponentCardsLeft: minOppCards(seat)
      };
      var mv = AI.decide(hand, state.trick, state.levelTeam0, ctx);
      if (mv) doPlay(seat, mv.cards); else doPass(seat);
    }, 750);
  }
  function minOppCards(seat) {
    var m = Infinity;
    for (var s = 0; s < 4; s++) {
      if (teamOf(s) !== teamOf(seat) && state.hands[s].length > 0) m = Math.min(m, state.hands[s].length);
    }
    return m === Infinity ? null : m;
  }

  /* ---------- 人类操作 ---------- */
  function onCardClick(i) {
    if (locked || state.matchOver || state.turn !== 0) return;
    if (selected.has(i)) selected.delete(i); else selected.add(i);
    renderHand();
  }
  function onPlayBtn() {
    if (state.turn !== 0 || locked) return;
    var cards = Array.from(selected).map(function (i) { return state.hands[0][i]; });
    if (!cards.length) { flashMsg("先点选要出的牌"); return; }
    var play = R.classify(cards, state.levelTeam0);
    if (!play) { flashMsg("不是合法牌型"); return; }
    if (state.trick && !R.beats(play, state.trick)) { flashMsg("压不过上家，试试别的牌型或「要不起」"); return; }
    selected.clear();
    doPlay(0, cards);
  }
  function onPassBtn() {
    if (state.turn !== 0 || locked) return;
    if (!state.trick || state.trick.seat === 0) { flashMsg("本轮由你先出，不能过"); return; }
    selected.clear();
    doPass(0);
  }
  function onHintBtn() {
    if (state.turn !== 0 || locked) return;
    var opts = state.trick ? R.responses(state.hands[0], state.trick, state.levelTeam0) : R.allPlays(state.hands[0], state.levelTeam0);
    if (!opts.length) { flashMsg("没有能压的牌，可以点「要不起」"); selected.clear(); renderHand(); return; }
    var mv = opts[hintIdx % opts.length];
    hintIdx++;
    selected.clear();
    mv.cards.forEach(function (c) {
      for (var i = 0; i < state.hands[0].length; i++) {
        if (state.hands[0][i].s === c.s && state.hands[0][i].r === c.r) { selected.add(i); break; }
      }
    });
    renderHand();
  }

  /* ---------- 渲染 ---------- */
  function cardHTML(c, cls) {
    var red = c.s === "H" || c.s === "D" || c.s === "J";
    var isLevel = c.s !== "J" && c.r === state.levelTeam0;
    var rank = c.s === "J" ? (c.r === "b" ? "大王" : "小王") : c.r;
    var suit = c.s === "J" ? "🃏" : SUIT_SYM[c.s];
    return '<span class="card ' + (cls || "") + (red ? " red" : "") + (isLevel ? " level" : "") + '">'
      + '<b>' + rank + '</b><i>' + suit + '</i></span>';
  }

  function render() {
    $("level-us").textContent = state.levelTeam0;
    $("level-them").textContent = state.levelTeam1;
    $("hand-num").textContent = "第 " + state.handNum + " 局";
    renderHand();
    for (var s = 1; s < 4; s++) renderSeat(s);
    renderTrickHint();
    updateButtons();
  }

  function renderHand() {
    var el = $("my-hand");
    var hand = state.hands[0];
    var html = "";
    for (var i = 0; i < hand.length; i++) {
      var c = hand[i];
      var sel = selected.has(i);
      html += cardHTML(c, "hand-card" + (sel ? " sel" : ""))
        .replace('<span class="card', '<span data-i="' + i + '" class="card');
    }
    el.innerHTML = html || '<span class="empty-tip">（手牌已出完）</span>';
    el.querySelectorAll(".card").forEach(function (node) {
      node.addEventListener("click", function () { onCardClick(parseInt(node.dataset.i, 10)); });
    });
  }

  function renderSeat(seat) {
    var el = $("seat-" + seat);
    var n = state.hands[seat].length;
    var mine = state.turn === seat;
    var played = state.table[seat];
    var html = '<div class="seat-head' + (mine ? " active" : "") + '"><b>' + SEAT_NAMES[seat] + "</b><span>" + n + " 张</span></div>";
    if (state.passFlags[seat]) html += '<div class="pass-tag">要不起</div>';
    else if (played) {
      html += '<div class="played">' + played.map(function (c) { return cardHTML(c, "mini"); }).join("") + "</div>";
    }
    html += '<div class="backs">' + '<i></i>'.repeat(Math.min(n, 12)) + (n > 12 ? '<em>…</em>' : '') + "</div>";
    el.innerHTML = html;
  }

  function renderTrickHint() {
    var el = $("trick-info");
    if (!state.trick) { el.textContent = state.turn === 0 ? "轮到你先出" : SEAT_NAMES[state.turn] + " 思考中…"; return; }
    var t = state.trick.play || state.trick;
    el.textContent = "桌面：" + typeName(t) + "（" + SEAT_NAMES[state.trick.seat] + "）· 轮到 " + (state.turn === 0 ? "你" : SEAT_NAMES[state.turn]);
  }

  function typeName(t) {
    var m = { single: "单张", pair: "对子", triple: "三张", triple2: "三带二", straight: "顺子", flush: "同花顺", pairs: "连对", plate: "钢板", bomb: "炸弹", jokerbomb: "王炸弹" };
    return m[t.type] || t.type;
  }

  function playText(cards, play) {
    return typeName(play) + " " + cards.length + "张";
  }

  function updateButtons() {
    var my = state.turn === 0 && !state.matchOver && !locked;
    $("btn-play").disabled = !my;
    $("btn-pass").disabled = !my || !state.trick || state.trick.seat === 0;
    $("btn-hint").disabled = !my;
  }

  function log(msg) {
    var el = $("game-log");
    var p = document.createElement("div");
    p.textContent = msg;
    el.insertBefore(p, el.firstChild);
    while (el.children.length > 6) el.removeChild(el.lastChild);
  }

  function flashMsg(msg) {
    var el = $("flash");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(flashMsg._t);
    flashMsg._t = setTimeout(function () { el.classList.add("hidden"); }, 1800);
  }

  /* ---------- 时长体系 ---------- */
  function applyTimeLock() {
    locked = true;
    clearTimeout(aiTimer);
    $("time-lock").classList.remove("hidden");
  }
  window.addEventListener("daobox:timeexceeded", applyTimeLock);

  /* ---------- 事件绑定 / 启动 ---------- */
  function boot() {
    $("app-version").textContent = APP_VERSION;
    $("refresh-btn").addEventListener("click", function () {
      if ("caches" in window) {
        caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        }).finally(function () { location.reload(); });
      } else location.reload();
    });
    $("btn-play").addEventListener("click", onPlayBtn);
    $("btn-pass").addEventListener("click", onPassBtn);
    $("btn-hint").addEventListener("click", onHintBtn);
    $("btn-new-hand").addEventListener("click", function () {
      // 重开当前级别一局（弃牌重发）
      state.trick = null; state.matchOver = false;
      startHand();
    });
    $("btn-next-hand").addEventListener("click", function () {
      $("result-modal").classList.add("hidden");
      if (state.matchOver) {
        state.levelTeam0 = "2"; state.levelTeam1 = "2";
        state.handNum = 1; state.matchOver = false;
        state.nextLeader = 0;
      }
      startHand();
    });
    $("btn-reset-all").addEventListener("click", function () {
      if (!confirm("确定从 2 级重新开始整盘吗？")) return;
      state = freshState();
      startHand();
    });
    $("lock-close").addEventListener("click", function () {
      $("time-lock").classList.add("hidden");
    });

    state = loadState() || freshState();
    // 恢复中：如果有残局（手牌非空且未结束）继续；否则开新局
    var midGame = state.hands.some(function (h) { return h.length > 0; }) && !state.matchOver;
    if (!midGame) startHand();
    else { log("已恢复上一局进度。"); render(); scheduleAI(); }

    setTimeout(function () {
      try { if (window.DaoBox && window.DaoBox.timeExceeded) applyTimeLock(); } catch (e) {}
    }, 1200);
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
