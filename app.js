/*
 * Backlot — app wiring.
 * Drives the debate playback (play / pause / skip, speed), reveals decisions
 * as the argument reaches them, then compiles and renders the production
 * packet: treatment, look bible, shot list, storyboard frames, export.
 */
(function () {
  'use strict';

  var Engine = window.BacklotEngine;
  var Providers = window.BacklotProviders;

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    idea: $('ideaInput'), run: $('runBtn'), badge: $('providerBadge'), status: $('statusLine'),
    settingsToggle: $('settingsToggle'), settings: $('settingsPanel'),
    apiKey: $('apiKeyInput'), baseUrl: $('baseUrlInput'), chatModel: $('chatModelInput'), imageModel: $('imageModelInput'),
    transcript: $('transcript'), decisions: $('decisionLog'), counter: $('turnCounter'),
    playPause: $('playPauseBtn'), skip: $('skipBtn'), speed: $('speedSelect'),
    outputs: $('outputs'), filmTitle: $('filmTitle'), filmLogline: $('filmLogline'),
    provenance: $('provenanceNote'), treatment: $('treatmentBody'), look: $('lookBody'),
    shots: $('shotList'), frames: $('framesGallery'),
    exportMd: $('exportMdBtn'), exportJson: $('exportJsonBtn')
  };

  var state = {
    prod: null,        // finished production (set when provider promise resolves)
    queue: [],         // turns emitted by the provider, awaiting reveal
    revealed: 0,
    total: 0,
    playing: false,
    timer: null,
    finished: false,   // outputs rendered
    lastRound: null
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setStatus(text) { els.status.textContent = text; }

  function currentSettings() {
    return {
      apiKey: els.apiKey.value.trim(),
      baseUrl: els.baseUrl.value.trim(),
      chatModel: els.chatModel.value.trim(),
      imageModel: els.imageModel.value.trim()
    };
  }

  function updateBadge() {
    var s = currentSettings();
    els.badge.textContent = s.apiKey
      ? 'Engine: Meta Model API (' + (s.chatModel || 'Muse Spark') + ' + ' + (s.imageModel || 'Muse Image') + '), local fallback on'
      : 'Engine: LocalEngine (built in, no key needed)';
  }

  /* ---------------- playback ---------------- */

  function delay() { return Math.round(1500 / parseInt(els.speed.value, 10)); }

  function scheduleNext() {
    clearTimeout(state.timer);
    if (!state.playing) return;
    state.timer = setTimeout(revealNext, delay());
  }

  function revealNext() {
    if (state.revealed < state.queue.length) {
      var turn = state.queue[state.revealed];
      state.revealed++;
      renderTurn(turn);
      renderDecisions();
      updateCounter();
      scheduleNext();
    } else if (state.prod) {
      finish();
    } else {
      scheduleNext(); /* provider still working (Meta voicing); poll gently */
    }
  }

  function renderTurn(turn) {
    if (turn.round !== state.lastRound) {
      state.lastRound = turn.round;
      var div = document.createElement('div');
      div.className = 'round-divider';
      div.textContent = 'Round: ' + turn.round;
      els.transcript.appendChild(div);
    }
    var el = document.createElement('article');
    el.className = 'turn ' + turn.agent + ' kind-' + turn.kind;
    el.innerHTML = '<div class="who"><strong>' + esc(turn.agentName) + '</strong>' +
      '<span class="kind">' + esc(turn.kind) + '</span></div><p>' + esc(turn.text) + '</p>';
    els.transcript.appendChild(el);
    els.transcript.scrollTop = els.transcript.scrollHeight;
  }

  function renderDecisions() {
    if (!state.prod) return;
    var shown = els.decisions.querySelectorAll('.decision').length;
    state.prod.decisions.forEach(function (d, i) {
      if (i >= shown && state.revealed >= d.afterTurn) {
        if (i === 0) els.decisions.innerHTML = '';
        var el = document.createElement('div');
        el.className = 'decision';
        el.innerHTML = '<h4>' + esc(d.clash) + ' — <span>' + esc(d.winner) + ' wins</span></h4><p>' + esc(d.why) + '</p>';
        els.decisions.appendChild(el);
        shown++;
      }
    });
  }

  function updateCounter() {
    els.counter.textContent = state.total ? ('Turn ' + state.revealed + ' of ' + state.total) : '';
  }

  function finish() {
    if (state.finished || !state.prod) return;
    state.finished = true;
    state.playing = false;
    clearTimeout(state.timer);
    els.playPause.disabled = true;
    els.skip.disabled = true;
    els.run.disabled = false;
    renderDecisions();
    renderOutputs(state.prod);
    setStatus('That is a wrap. The packet is compiled below.');
  }

  /* ---------------- run ---------------- */

  function startRun() {
    var idea = els.idea.value.trim();
    if (!idea) { setStatus('Give the room an idea first. One line is enough.'); els.idea.focus(); return; }
    var settings = currentSettings();
    var provider = Providers.createProvider(settings);

    state.prod = null; state.queue = []; state.revealed = 0; state.total = 0;
    state.finished = false; state.lastRound = null; state.playing = true;
    els.transcript.innerHTML = '';
    els.decisions.innerHTML = '<p class="empty-note">The argument has started. Decisions land here as the room reaches them.</p>';
    els.outputs.hidden = true;
    els.run.disabled = true;
    els.playPause.disabled = false; els.playPause.textContent = 'Pause';
    els.skip.disabled = false;
    updateBadge();
    setStatus('Shooting the argument. ' + provider.name + ' is running the room.');

    provider.produce(idea, function (turn) {
      state.queue.push(turn);
      state.total = state.queue.length;
      updateCounter();
    }).then(function (prod) {
      state.prod = prod;
      state.total = prod.debate.length;
      updateCounter();
      renderDecisions();
      if (state.revealed >= state.total) finish();
    }).catch(function (err) {
      setStatus('The provider hit a problem (' + err.message + '). The local engine has taken over.');
      var local = new Providers.LocalEngineProvider();
      state.queue = []; state.revealed = 0;
      els.transcript.innerHTML = '';
      state.lastRound = null;
      local.produce(idea, function (turn) { state.queue.push(turn); state.total = state.queue.length; })
        .then(function (prod) { state.prod = prod; state.total = prod.debate.length; });
    });

    scheduleNext();
  }

  /* ---------------- outputs ---------------- */

  function renderOutputs(prod) {
    els.filmTitle.textContent = prod.treatment.title;
    els.filmLogline.textContent = prod.treatment.logline;
    var pv = prod.provenance || {};
    els.provenance.textContent = 'Provenance — debate: ' + (pv.debate || 'local') +
      ' · treatment: ' + (pv.treatment || 'local') + ' · frames: ' + (pv.frames || 'local-svg') +
      ' · seed ' + prod.seed;

    var t = prod.treatment;
    var html = '';
    t.synopsis.forEach(function (para) { html += '<p>' + esc(para) + '</p>'; });
    html += '<h3>Themes</h3><ul class="themes">';
    t.themes.forEach(function (th) { html += '<li>' + esc(th) + '</li>'; });
    html += '</ul><h3>Characters</h3>';
    t.characters.forEach(function (c) {
      html += '<div class="character"><strong>' + esc(c.name) + '</strong> <span>(' + esc(c.role) + ')</span><br>' +
        'Wants: ' + esc(c.want) + '<br>Flaw: ' + esc(c.flaw) + '</div>';
    });
    els.treatment.innerHTML = html;

    var b = prod.lookBible;
    els.look.innerHTML = '<dl>' +
      '<dt>Character lock</dt><dd>' + esc(b.character) + '</dd>' +
      '<dt>Palette lock</dt><dd>' + esc(b.palette) + '</dd>' +
      '<dt>Light</dt><dd>' + esc(b.light) + '</dd>' +
      '<dt>Era</dt><dd>' + esc(b.era) + '</dd></dl>' +
      '<p>Every frame, however it is rendered, is briefed against this bible so the keeper, the coat and the light never change between boards.</p>';

    els.shots.innerHTML = prod.shotList.map(function (sh) {
      return '<li><div class="shot-num">' + sh.n + '</div><div>' +
        '<div class="shot-meta">' + esc(sh.size) + ' · ' + esc(sh.lens) + ' · ' + esc(sh.movement) + '</div>' +
        '<span class="shot-beat">' + esc(sh.beat) + '</span><p>' + esc(sh.description) + '</p></div></li>';
    }).join('');

    els.frames.innerHTML = prod.frames.map(function (f) {
      var visual = f.imageUrl
        ? '<img class="frame-img" src="' + esc(f.imageUrl) + '" alt="Storyboard frame for shot ' + f.shot + '">'
        : f.svg;
      if (!f.imageUrl) visual = visual.replace('<svg ', '<svg class="frame-img" ');
      return '<figure class="frame">' + visual + '<figcaption><strong>Frame ' + f.frame +
        ' · Shot ' + f.shot + ' — ' + esc(f.beat) + '</strong><p>' + esc(f.prompt) + '</p></figcaption></figure>';
    }).join('');

    els.outputs.hidden = false;
    els.outputs.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------------- export ---------------- */

  function slug(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'backlot';
  }

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
  }

  els.exportMd.addEventListener('click', function () {
    if (!state.prod) return;
    download('backlot-' + slug(state.prod.treatment.title) + '.md', Engine.toMarkdown(state.prod), 'text/markdown');
  });
  els.exportJson.addEventListener('click', function () {
    if (!state.prod) return;
    download('backlot-' + slug(state.prod.treatment.title) + '.json', JSON.stringify(state.prod, null, 2), 'application/json');
  });

  /* ---------------- controls ---------------- */

  els.run.addEventListener('click', startRun);
  els.idea.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) startRun();
  });
  els.playPause.addEventListener('click', function () {
    state.playing = !state.playing;
    els.playPause.textContent = state.playing ? 'Pause' : 'Play';
    if (state.playing) scheduleNext();
    else clearTimeout(state.timer);
  });
  els.skip.addEventListener('click', function () {
    clearTimeout(state.timer);
    while (state.revealed < state.queue.length) {
      renderTurn(state.queue[state.revealed]);
      state.revealed++;
    }
    renderDecisions();
    updateCounter();
    if (state.prod) finish();
    else setStatus('Skipped ahead. Waiting for the room to finish compiling.');
  });
  els.settingsToggle.addEventListener('click', function () {
    els.settings.hidden = !els.settings.hidden;
  });
  [els.apiKey, els.baseUrl, els.chatModel, els.imageModel].forEach(function (input) {
    input.addEventListener('input', updateBadge);
  });

  updateBadge();
})();
