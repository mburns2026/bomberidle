// Mock minimo do Phaser so para rodar a FarmScene sem navegador (smoke test). Nada disto vai para o repositorio.
const stats = { created: 0, destroyed: 0, byTex: {}, tweens: 0 };
function go(init = {}) {
  const t = { x: 0, y: 0, width: 28, height: 28, alpha: 1, visible: true, active: true, flipX: false, texture: init.texture, tint: undefined, destroyed: false,
    anims: { isPlaying: false, timeScale: 1, play() { this.isPlaying = true; }, stop() { this.isPlaying = false; } }, ...init };
  stats.created++; if (t.texture) stats.byTex[t.texture] = (stats.byTex[t.texture] || 0) + 1;
  const p = new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === "then") return undefined;
      if (k === "setPosition") return (x, y) => { o.x = x; o.y = y ?? o.y; return p; };
      if (k === "setTexture") return (n) => { o.texture = n; return p; };
      if (k === "setVisible") return (v) => { o.visible = v; return p; };
      if (k === "setActive") return (v) => { o.active = v; return p; };
      if (k === "setFlipX") return (v) => { o.flipX = v; return p; };
      if (k === "setAlpha") return (v) => { o.alpha = v; return p; };
      if (k === "play") return () => { o.anims.isPlaying = true; return p; };
      if (k === "destroy") return () => { if (!o.destroyed) { o.destroyed = true; stats.destroyed++; } };
      return () => p; // qualquer outro setXxx/explode/... encadeia
    },
    set(o, k, v) { o[k] = v; return true; },
  });
  return p;
}
class Scene {
  constructor(key) { this.key = key; }
}
const Phaser = {
  Scene, WEBGL: 2, AUTO: 0, BlendModes: { ADD: 1, NORMAL: 0 },
  Scenes: { Events: { SHUTDOWN: "shutdown" } },
  Scale: { FIT: 1, CENTER_BOTH: 1 }, Game: class {},
  GameObjects: {}, Math: {},
  Utils: { Array: { Shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; } } },
  __go: go, __stats: stats,
};
module.exports = Phaser;
