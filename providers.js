/*
 * Backlot — provider layer.
 *
 * Backlot runs entirely on its LocalEngine: a structured, deterministic
 * generation engine (see engine.js) that needs no key, no account and no
 * network. It is the default and the demo path.
 *
 * MetaModelProvider is an optional integration point for the Meta Model API.
 * It is only used when a visitor pastes their own API key into the settings
 * field. The key lives in a module variable for the session only: it is never
 * hardcoded, never written to disk, and never sent anywhere except the API
 * base URL the visitor configured. If any Meta call fails, the provider
 * quietly falls back to the LocalEngine for that stage and records the
 * fallback in the production's provenance, so the app never dead-ends.
 */
(function (root) {
  'use strict';

  var Engine = root.BacklotEngine;

  /* ---------------- LocalEngine provider (default) ---------------- */

  function LocalEngineProvider() {
    this.name = 'LocalEngine';
    this.description = 'Built-in structured engine. No key, no network, deterministic per idea.';
  }

  LocalEngineProvider.prototype.produce = function (idea, emit) {
    var prod = Engine.runStudio(idea);
    prod.provenance = { debate: 'local', treatment: 'local', frames: 'local-svg', provider: this.name };
    prod.debate.forEach(function (turn) { emit(turn); });
    return Promise.resolve(prod);
  };

  /* ---------------- Meta Model API provider (optional) ---------------- */

  var sessionConfig = { apiKey: '', baseUrl: 'https://api.meta.ai/v1', chatModel: 'Muse Spark', imageModel: 'Muse Image' };

  function MetaModelProvider(config) {
    this.name = 'Meta Model API';
    this.config = {
      apiKey: (config && config.apiKey) || '',
      baseUrl: ((config && config.baseUrl) || sessionConfig.baseUrl).replace(/\/$/, ''),
      chatModel: (config && config.chatModel) || sessionConfig.chatModel,
      imageModel: (config && config.imageModel) || sessionConfig.imageModel
    };
  }

  MetaModelProvider.prototype.isConfigured = function () {
    return typeof fetch === 'function' && !!this.config.apiKey;
  };

  MetaModelProvider.prototype.chat = function (messages) {
    var cfg = this.config;
    return fetch(cfg.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
      body: JSON.stringify({ model: cfg.chatModel, messages: messages, temperature: 0.8 })
    }).then(function (res) {
      if (!res.ok) throw new Error('Meta Model API chat failed: HTTP ' + res.status);
      return res.json();
    }).then(function (json) {
      var text = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
      if (!text) throw new Error('Meta Model API chat returned no content');
      return text.trim();
    });
  };

  MetaModelProvider.prototype.image = function (prompt) {
    var cfg = this.config;
    return fetch(cfg.baseUrl + '/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
      body: JSON.stringify({ model: cfg.imageModel, prompt: prompt })
    }).then(function (res) {
      if (!res.ok) throw new Error('Meta Model API image failed: HTTP ' + res.status);
      return res.json();
    }).then(function (json) {
      var d = json && json.data && json.data[0];
      if (!d) throw new Error('Meta Model API image returned no data');
      if (d.url) return d.url;
      if (d.b64_json) return 'data:image/png;base64,' + d.b64_json;
      throw new Error('Meta Model API image returned no usable image field');
    });
  };

  /*
   * Strategy: the LocalEngine stages the full debate first (it is structured
   * and capped). When a key is configured, each debate turn is then voiced by
   * the matching agent persona through the chat model, with the local text as
   * the binding brief, and frames are generated with the image model from the
   * locked look-bible prompts. Any failure falls back per stage to local.
   */
  MetaModelProvider.prototype.produce = function (idea, emit) {
    var self = this;
    var local = Engine.runStudio(idea);
    local.provenance = { debate: 'local', treatment: 'local', frames: 'local-svg', provider: this.name };
    if (!this.isConfigured()) {
      local.debate.forEach(function (turn) { emit(turn); });
      return Promise.resolve(local);
    }

    var transcript = [];
    var chain = Promise.resolve();
    local.debate.forEach(function (turn) {
      chain = chain.then(function () {
        var system = 'You are the ' + turn.agentName + ' in a film studio story meeting for a ' +
          local.parsed.genre + '. Setting: ' + local.parsed.setting + '. Seed idea: "' + idea + '". ' +
          'Speak in character, in the first person, fiercely but briefly (60-110 words). ' +
          'You must land exactly the position in the brief you are given; do not invent new plot facts, ' +
          'do not break the binding rules recorded in the transcript, and end on your position.';
        var user = 'Transcript so far:\n' + (transcript.join('\n') || '(you open the discussion of this point)') +
          '\n\nYour brief for this ' + turn.kind + ':\n' + turn.text;
        return self.chat([{ role: 'system', content: system }, { role: 'user', content: user }])
          .then(function (voiced) {
            turn.text = voiced;
            turn.voicedBy = self.config.chatModel;
            local.provenance.debate = 'meta:' + self.config.chatModel;
          })
          .catch(function () { /* keep local text for this turn */ })
          .then(function () {
            transcript.push(turn.agentName + ': ' + turn.text);
            emit(turn);
          });
      });
    });

    return chain.then(function () {
      var imgChain = Promise.resolve();
      local.frames.forEach(function (frame) {
        imgChain = imgChain.then(function () {
          return self.image(frame.prompt).then(function (url) {
            frame.imageUrl = url;
            local.provenance.frames = 'meta:' + self.config.imageModel;
          }).catch(function () { /* keep the SVG previz frame */ });
        });
      });
      return imgChain.then(function () { return local; });
    });
  };

  /* ---------------- registry ---------------- */

  function createProvider(settings) {
    if (settings && settings.apiKey) return new MetaModelProvider(settings);
    return new LocalEngineProvider();
  }

  root.BacklotProviders = {
    LocalEngineProvider: LocalEngineProvider,
    MetaModelProvider: MetaModelProvider,
    createProvider: createProvider,
    sessionConfig: sessionConfig
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BacklotProviders;
})(typeof window !== 'undefined' ? window : globalThis);
