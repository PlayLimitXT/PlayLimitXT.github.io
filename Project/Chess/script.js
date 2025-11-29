let board = null;
let game = new Chess();
let stockfish = null;
let isThinking = false;
let isAnalyzing = true;
let playerSide = 'w';
let currentElo = 1200;
//let currentTime = 5000;
let aiLevel = 3;
let selectedSq = null;
let snapshotPly = -1;
let hintState = 0;
let currentBestMove = null;

function pieceUrl(piece) {
  return 'resources/' + piece + '.svg'
}
$(document).ready(() => {
  initEngine();
  board = Chessboard('board', {
    draggable: true,
    position: 'start',
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd,
    pieceTheme: pieceUrl,
    moveSpeed: 200
  });
  $(window).resize(() => {
    board.resize();
    redrawArrows()
  });
  $('#board').on('click', '.square-55d63', onSquareClick);
  /*
  $('#elo').on('input', function() {
    currentElo = this.value;
    $('#eloDisp').text(currentElo)
  });
  */
  $('#level').on('input', function() {
    aiLevel = this.value;
    $('#levelDisp').text(aiLevel)
  });
  /*
  $('#time').on('input', function() {
    currentTime = this.value;
    $('#timeDisp').text(currentTime)
  });
  */
  initGame('w')
  stockfish.postMessage("setoption name UCI_LimitStrength value false")
});

function initGame(side) {
  if (side === 'r') side = Math.random() < 0.5 ? 'w' : 'b';
  playerSide = side;
  $('#btnW, #btnB, #btnR').removeClass('active');
  if (side === 'w') $('#btnW').addClass('active');
  if (side === 'b') $('#btnB').addClass('active');
  if (side === 'r') $('#btnR').addClass('active');
  game.reset();
  board.orientation(side === 'w' ? 'white' : 'black');
  board.position('start');
  snapshotPly = -1;
  selectedSq = null;
  resetHint();
  clearVisuals();
  updateUI();
  triggerAnalysis();
  if (side === 'b') setTimeout(aiMove, 500)
}

function execMove(moveObj) {
  if (snapshotPly !== -1) {
    if (!confirm("Create new game branch from here?")) return false;
    const fen = game.fen();
    game.load(fen);
    snapshotPly = -1
  }
  const result = game.move(moveObj);
  if (!result) return false;
  selectedSq = null;
  clearVisuals();
  resetHint();
  updateUI();
  triggerAnalysis();
  return true
}

function onDragStart(source, piece) {
  if (game.game_over() || isThinking || snapshotPly !== -1) return false;
  if ((game.turn() === 'w' && piece.search(/^b/) !== -1) || (game.turn() === 'b' && piece.search(/^w/) !== -1)) return false;
  clearVisuals();
  selectedSq = source;
  highlightSquare(source);
  showLegalMoves(source)
}

function onDrop(source, target) {
  const move = execMove({
    from: source,
    to: target,
    promotion: 'q'
  });
  if (!move) return 'snapback';
  board.position(game.fen(), false);
  if (!game.game_over()) setTimeout(aiMove, 200)
}

function onSquareClick() {
  if (game.game_over() || isThinking || snapshotPly !== -1) return;
  const sq = $(this).attr('data-square');
  const piece = game.get(sq);
  if (piece && piece.color === game.turn()) {
    clearVisuals();
    selectedSq = sq;
    highlightSquare(sq);
    showLegalMoves(sq);
    return
  }
  if (selectedSq) {
    const success = execMove({
      from: selectedSq,
      to: sq,
      promotion: 'q'
    });
    if (success) {
      board.position(game.fen(), true);
      if (!game.game_over()) setTimeout(aiMove, 500)
    } else {
      clearVisuals();
      selectedSq = null
    }
  }
}

function showLegalMoves(square) {
  const moves = game.moves({
    square: square,
    verbose: true
  });
  moves.forEach(m => {
    const $sq = $('#board .square-' + m.to);
    if (game.get(m.to)) $sq.addClass('legal-capture-hint');
    else $sq.addClass('legal-move-hint')
  })
}

function onSnapEnd() {
  board.position(game.fen())
}

function initEngine() {
  try {
    stockfish = new Worker('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.0/stockfish.js');
  } catch (e) {
    const blob = new Blob([`importScripts('https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.0/stockfish.js');`], {
      type: 'application/javascript'
    });
    stockfish = new Worker(URL.createObjectURL(blob));
  }
  stockfish.postMessage('uci');
  stockfish.onmessage = function(e) {
    const msg = e.data;
    if (msg.includes('bestmove')) {
      const best = msg.split(' ')[1];
      if (hintState === 1) {
        currentBestMove = best;
        hintState = 2;
        updateHintButton();
        if (best) {
          const from = best.substring(0, 2);
          highlightSquare(from)
        }
        return
      }
      if (isThinking) {
        isThinking = false;
        $('#engineState').text("Engine: Idle");
        if (best) {
          const f = best.substring(0, 2);
          const t = best.substring(2, 4);
          execMove({
            from: f,
            to: t,
            promotion: 'q'
          });
          board.position(game.fen(), true)
        }
      }
    }
    if (msg.includes('info') && msg.includes('score') && !isThinking && hintState === 0) {
      parseAnalysis(msg)
    }
  }
}

function aiMove() {
  if (game.game_over()) return;
  isThinking = true;
  $('#engineState').text("Thinking...");
  //const depth = Math.floor(currentElo / 200) + 1;
  //const depth = Math.round(1 + (currentElo - 100) / (3000 - 100) * 24);
  
  stockfish.postMessage('setoption name Skill Level value ' + aiLevel)
  //stockfish.postMessage('go depth ' + depth /* + ' movetime ' + currentTime */ )
  //stockfish.postMessage("setoption name UCI_LimitStrength value false")
  stockfish.postMessage('position fen ' + game.fen())
  stockfish.postMessage("go")
}

function triggerAnalysis() {
  if (!isAnalyzing || game.game_over()) return;
  stockfish.postMessage('position fen ' + game.fen());
  stockfish.postMessage('setoption name Skill Level value 20')
  //stockfish.postMessage("setoption name UCI_LimitStrength value false")
  stockfish.postMessage('go depth 16')
}

function parseAnalysis(line) {
  let score = 0.0;
  let scoreText = "0.00";
  if (line.includes('mate')) {
    const parts = line.split('mate ')[1].split(' ')[0];
    scoreText = "M" + Math.abs(parseInt(parts));
    score = parseInt(parts) > 0 ? 1000 : -1000
  } else if (line.includes('cp')) {
    const parts = line.split('cp ')[1].split(' ')[0];
    let cp = parseInt(parts);
    if (game.turn() === 'b') cp = -cp;
    score = cp;
    scoreText = (cp / 100).toFixed(2);
    if (cp > 0) scoreText = "+" + scoreText
  }
  $('#evalScore').text(scoreText);
  const pct = 50 + (Math.max(-500, Math.min(500, score)) / 10);
  $('#evalFill').css('height', pct + '%');
  if (line.includes(' pv ')) {
    const moves = line.split(' pv ')[1].split(' ').slice(0, 4).join(' ');
    $('#bestLine').text(moves)
  }
}

function nextHintStep() {
  if (isThinking || game.game_over()) return;
  if (hintState === 0) {
    hintState = 1;
    updateHintButton();
    //stockfish.postMessage("setoption name UCI_LimitStrength value false")
    stockfish.postMessage('setoption name Skill Level value 20')
    stockfish.postMessage('position fen ' + game.fen())
    stockfish.postMessage('go depth 16')
  } else if (hintState === 2) {
    hintState = 3;
    updateHintButton();
    if (currentBestMove) {
      const f = currentBestMove.substring(0, 2);
      const t = currentBestMove.substring(2, 4);
      drawArrow(f, t)
    }
  } else if (hintState === 3) {
    resetHint();
    clearVisuals()
  }
}

function resetHint() {
  hintState = 0;
  currentBestMove = null;
  updateHintButton()
}

function updateHintButton() {
  const btn = $('#btnHint');
  const txt = $('#hintText');
  btn.removeClass('btn-hint-active');
  if (hintState === 0) {
    txt.text('Hint')
  } else if (hintState === 1) {
    txt.text('Calc...');
    btn.addClass('btn-hint-active')
  } else if (hintState === 2) {
    txt.text('Show Path');
    btn.addClass('btn-hint-active')
  } else if (hintState === 3) {
    txt.text('Clear');
    btn.addClass('btn-hint-active')
  }
}

function highlightSquare(sq) {
  $('#board .square-' + sq).addClass('highlight-src')
}

function clearVisuals() {
  $('#board .square-55d63').removeClass('highlight-src highlight-dst legal-move-hint legal-capture-hint');
  $('#arrowLayer').empty()
}

function drawArrow(from, to) {
  const $svg = $('#arrowLayer');
  $svg.empty();
  if (!from || !to) return;
  const $f = $('#board .square-' + from);
  const $t = $('#board .square-' + to);
  if (!$f.length || !$t.length) return;
  const bPos = $('#board').offset();
  const fPos = $f.offset();
  const tPos = $t.offset();
  const w = $f.width();
  const x1 = fPos.left - bPos.left + w / 2;
  const y1 = fPos.top - bPos.top + w / 2;
  const x2 = tPos.left - bPos.left + w / 2;
  const y2 = tPos.top - bPos.top + w / 2;
  const html = `<defs><marker id="head"markerWidth="4"markerHeight="4"refX="2"refY="2"orient="auto"><path d="M0,0 V4 L4,2 Z"fill="#f472b6"/></marker></defs><line x1="${x1}"y1="${y1}"x2="${x2}"y2="${y2}"stroke="#f472b6"stroke-width="6"marker-end="url(#head)"opacity="0.8"/>`;
  $svg.html(html)
}

function redrawArrows() {
  $('#arrowLayer').empty()
}

function updateUI() {
  let st = "";
  if (game.in_checkmate()) st = "Checkmate!";
  else if (game.in_draw()) st = "Draw";
  else {
    st = (game.turn() === 'w' ? "White" : "Black") + " to move";
    if (game.in_check()) st += " (CHECK)"
  }
  $('#status').text(st);
  if (snapshotPly === -1) $('#pgnBox').val(game.pgn());
  renderHistory();
  renderMaterial()
}

function renderHistory() {
  const h = game.history({
    verbose: true
  });
  let html = '';
  for (let i = 0; i < h.length; i += 2) {
    const num = (i / 2) + 1;
    const w = h[i];
    const b = h[i + 1];
    const wC = (snapshotPly === i + 1) ? 'curr' : '';
    const bC = (snapshotPly === i + 2) ? 'curr' : '';
    html += `<div class="move-row"><span style="color:#666">${num}.</span><span class="${wC}"onclick="viewSnap(${i+1})">${w.san}</span><span class="${bC}"onclick="viewSnap(${b?i+2:-1})">${b?b.san:''}</span></div>`
  }
  $('#histList').html(html);
  if (snapshotPly === -1) $('#histList').scrollTop(99999)
}
window.viewSnap = function(ply) {
  if (ply === -1) return;
  snapshotPly = ply;
  const t = new Chess();
  const m = game.history();
  for (let i = 0; i < ply; i++) t.move(m[i]);
  board.position(t.fen());
  renderHistory();
  clearVisuals();
  resetHint()
};

function renderMaterial() {
  const val = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: 0
  };
  const boardArr = game.board();
  let cnt = {
    w: {},
    b: {}
  };
  let wS = 0,
    bS = 0;
  boardArr.forEach(r => r.forEach(p => {
    if (p) {
      if (!cnt[p.color][p.type]) cnt[p.color][p.type] = 0;
      cnt[p.color][p.type]++;
      if (p.color === 'w') wS += val[p.type];
      else bS += val[p.type]
    }
  }));
  const start = {
    p: 8,
    n: 2,
    b: 2,
    r: 2,
    q: 1
  };

  function getHtml(c) {
    let h = '';
    ['q', 'r', 'b', 'n', 'p'].forEach(t => {
      const lost = start[t] - (cnt[c][t] || 0);
      if (lost > 0) {
        const key = c + (t === 'p' ? 'P' : t.toUpperCase());
        const url = pieceUrl(key);
        for (let k = 0; k < lost; k++) h += `<img src="${url}">`
      }
    });
    return h
  }
  const diff = wS - bS;
  $('#matTop').html(getHtml('w') + (diff < 0 ? `<span style="color:#fff">+${Math.abs(diff)}</span>` : ''));
  $('#matBot').html(getHtml('b') + (diff > 0 ? `<span style="color:#fff">+${diff}</span>` : ''))
}

function undo() {
  if (isThinking) return;
  game.undo();
  game.undo();
  snapshotPly = -1;
  board.position(game.fen());
  clearVisuals();
  resetHint();
  updateUI();
  triggerAnalysis()
}

function copyPGN() {
  navigator.clipboard.writeText(game.pgn())
}

function loadPGN() {
  if (game.load_pgn($('#pgnBox').val())) {
    snapshotPly = -1;
    board.position(game.fen());
    updateUI();
    triggerAnalysis()
  } else alert("Invalid PGN")
}