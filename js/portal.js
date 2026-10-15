'use strict';
// A thin adapter between the game and a web portal's SDK. Today it speaks CrazyGames SDK v3.
// The SDK is only loaded when the game runs on CrazyGames (or with ?portal=crazygames for testing);
// everywhere else every call is a harmless no-op, ads are off, and saves use localStorage.
(function () {
  const RD = window.RD;
  const onCG = /crazygames/i.test(location.hostname + ' ' + document.referrer) || /[?&]portal=crazygames\b/.test(location.search);
  let sdk = null;
  let playing = false;

  const P = (RD.portal = {
    name: 'none',
    ads: false, // true once an SDK that can show ads is ready
    onPause: null, // set by the game: freeze the raid and mute while an ad plays
    onResume: null,
    onMute: null, // the portal's own mute setting changed
  });

  const live = () => sdk && P.name === 'crazygames';
  const call = (fn) => { if (!live()) return; try { fn(); } catch (e) { /* never let the portal break the game */ } };

  P.init = function () {
    if (!onCG) return Promise.resolve();
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
      s.onload = async () => {
        try {
          await window.CrazyGames.SDK.init();
          sdk = window.CrazyGames.SDK;
          if (sdk.environment !== 'disabled') {
            P.name = 'crazygames';
            P.ads = true;
            sdk.game.addSettingsChangeListener((st) => { if (P.onMute) P.onMute(!!st.muteAudio); });
          }
        } catch (e) { sdk = null; }
        resolve();
      };
      s.onerror = () => resolve();
      document.head.append(s);
    });
  };

  P.muted = () => { try { return live() && !!sdk.game.settings.muteAudio; } catch (e) { return false; } };
  P.loadingStart = () => call(() => sdk.game.loadingStart());
  P.loadingStop = () => call(() => sdk.game.loadingStop());
  // gameplay = the player is in the dungeon (building or watching a raid); menus and reports are not
  P.gameplayStart = () => { if (playing) return; playing = true; call(() => sdk.game.gameplayStart()); };
  P.gameplayStop = () => { if (!playing) return; playing = false; call(() => sdk.game.gameplayStop()); };
  P.happytime = () => call(() => sdk.game.happytime());
  P.context = (ctx) => call(() => sdk.game.setGameContext && sdk.game.setGameContext(ctx));

  function ad(kind, done) {
    if (!live()) { done(false); return; }
    let settled = false;
    const wasPlaying = playing; // an ad is a break in play; resume the gameplay state afterwards
    const finish = (ok) => { if (settled) return; settled = true; if (P.onResume) P.onResume(); if (wasPlaying) P.gameplayStart(); done(ok); };
    try {
      sdk.ad.requestAd(kind, {
        adStarted: () => { P.gameplayStop(); if (P.onPause) P.onPause(); },
        adFinished: () => finish(true),
        adError: () => finish(false), // no fill, cooldown, ad blocker: carry on without a reward
      });
    } catch (e) { finish(false); }
  }
  // a natural break between nights; the portal decides whether an ad actually plays
  P.midgame = (done) => ad('midgame', () => done());
  // an optional ad the player chose; the reward is granted only when it finished
  P.rewarded = (done) => ad('rewarded', (ok) => done(ok));

  // Saves: CrazyGames' data module syncs to the player's account; otherwise localStorage.
  P.storage = function () {
    try { if (live() && sdk.data) return sdk.data; } catch (e) { /* fall through */ }
    try { return window.localStorage; } catch (e) { return null; }
  };
})();
