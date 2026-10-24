import test from 'node:test'; import assert from 'node:assert/strict'; import vm from 'node:vm'; import {read} from './harness.mjs';
function boot() {
  const store = {}, listeners = [], sb = {window: {dispatchEvent() {}}, localStorage: {getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }}, addEventListener() {}, Event: class {}, Date, Math, JSON, Number, Array, Object};
  sb.window.localStorage = sb.localStorage; vm.createContext(sb); vm.runInContext(read('skins.js'), sb); vm.runInContext(read('save.js'), sb); return {Save: sb.window.Save, store};
}
test('offline: farm AFK respeita teto rígido e cota AFK (paridade com o servidor)', () => {
  const {Save, store} = boot(); const s = JSON.parse(store.slitheri_save_v1 || '{}');
  Save.s.snakes = Array.from({length: 8}, (_, i) => ({id: i + 1, rarity: 'epic', speed: 4, magnet: 25, afk: 8, lvl: 0})); Save.s.afkAt = Date.now() - 24 * 36e5;
  store.slitheri_save_v1 = JSON.stringify(Save.s); const r = Save.farmClaim();
  assert.ok(r.claimed <= 300 * 0.4 + 1e-9, 'claimed=' + r.claimed); assert.ok(Save.s.today <= 300);
});
test('offline: upgrade linear sobre a taxa base e nível máximo', () => {
  const {Save, store} = boot(); Save.s.bal = 1e6; Save.s.snakes = [{id: 1, rarity: 'epic', speed: 4, magnet: 25, afk: 8, lvl: 0}]; store.slitheri_save_v1 = JSON.stringify(Save.s);
  assert.equal(Save.upgradeSnake(1).snake.afk, 10); Save.s.snakes[0].lvl = 10; store.slitheri_save_v1 = JSON.stringify(Save.s); assert.equal(Save.upgradeSnake(1).err, 'max_level');
});
test('offline: ganho nunca passa do teto diário', () => {
  const {Save} = boot(); for (let i = 0; i < 500; i++) Save.earn(50); assert.ok(Save.s.today <= 300 + 1e-6, 'today=' + Save.s.today);
});
