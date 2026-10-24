// Catálogo de skins + desenho (compartilhado entre loja e jogo). Índice no array = id (ids 0–3 mantidos por compatibilidade).
(function () {
  const TIER = [['Free','Grátis','Gratis','免费'],['Common','Comum','Común','普通'],['Rare','Raro','Raro','稀有'],['Epic','Épico','Épico','史诗'],['Legendary','Lendário','Legendario','传说'],['Mythic','Mítico','Mítico','神话']];
  const TIER_COLORS = ['#9aa3b8', '#9aa3b8', '#4dd2ff', '#b44dff', '#f3ba2f', '#ff4d6d'];
  const TABS = [['All','Flags','Colors','Models','Premium'],['Todas','Bandeiras','Cores','Modelos','Premium'],['Todas','Banderas','Colores','Modelos','Premium'],['全部','国旗','配色','造型','高级']];
  const COSM = ['Cosmetic','Cosmética','Cosmética','外观'], MAG = ['coin magnet','ímã de moedas','imán de monedas','金币磁铁'], FREE = ['FREE','GRÁTIS','GRATIS','免费'];
  const FX = {fire: ['#ff8a00','#ffd23f','#ff3d00'], ice: ['#ffffff','#9fe8ff','#4dd2ff'], stars: ['#ffffff','#b9a2ff','#ffd6ff'], sparkle: ['#fff1a8','#ffd23f','#ffffff']};
  const S = [];
  const add = (n, price, tier, cat, o) => S.push(Object.assign({id: S.length, n, price, tier, cat, band: 3, magnet: 0, head: '', fx: '', anim: '', colors: ['#ffffff']}, o));
  const flag = (n, colors) => add(n, 300, 1, 'flag', {colors, band: 4});

  add(['Classic Neon','Neon Clássico','Neón Clásico','经典霓虹'], 0, 0, 'color', {colors: ['#ff007f', '#00ffcc']});
  add(['Cyber-Viper','Cyber-Viper','Cyber-Viper','Cyber-Viper'], 500, 1, 'color', {colors: ['#00f2fe', '#4facfe'], fx: 'ice'});
  add(['Diamond $HODL','Diamond $HODL','Diamond $HODL','Diamond $HODL'], 1500, 3, 'color', {colors: ['#ffffff', '#f3ba2f'], magnet: 30, head: 'crown', fx: 'sparkle'});
  add(['Solana Plasma','Solana Plasma','Solana Plasma','Solana Plasma'], 3000, 4, 'color', {colors: ['#9945ff', '#14f195', '#4dd2ff'], magnet: 50, anim: 'flow'});
  // Bandeiras (listras na ordem da bandeira)
  flag(['Brazil','Brasil','Brasil','巴西'], ['#009c3b','#ffdf00','#002776']);
  flag(['USA','EUA','EE. UU.','美国'], ['#b22234','#ffffff','#3c3b6e','#ffffff']);
  flag(['Portugal','Portugal','Portugal','葡萄牙'], ['#006600','#006600','#ff0000']);
  flag(['Spain','Espanha','España','西班牙'], ['#aa151b','#f1bf00','#f1bf00','#aa151b']);
  flag(['Argentina','Argentina','Argentina','阿根廷'], ['#74acdf','#ffffff','#74acdf']);
  flag(['Mexico','México','México','墨西哥'], ['#006847','#ffffff','#ce1126']);
  flag(['Japan','Japão','Japón','日本'], ['#ffffff','#ffffff','#bc002d']);
  flag(['China','China','China','中国'], ['#de2910','#de2910','#ffde00']);
  flag(['Germany','Alemanha','Alemania','德国'], ['#000000','#dd0000','#ffce00']);
  flag(['France','França','Francia','法国'], ['#0055a4','#ffffff','#ef4135']);
  flag(['Italy','Itália','Italia','意大利'], ['#009246','#ffffff','#ce2b37']);
  flag(['United Kingdom','Reino Unido','Reino Unido','英国'], ['#012169','#ffffff','#c8102e','#ffffff']);
  flag(['Canada','Canadá','Canadá','加拿大'], ['#ff0000','#ffffff','#ffffff','#ff0000']);
  flag(['India','Índia','India','印度'], ['#ff9933','#ffffff','#138808']);
  flag(['South Korea','Coreia do Sul','Corea del Sur','韩国'], ['#ffffff','#cd2e3a','#0047a0']);
  flag(['Colombia','Colômbia','Colombia','哥伦比亚'], ['#fcd116','#fcd116','#003893','#ce1126']);
  // Cores
  add(['Solar Orange','Laranja Solar','Naranja Solar','烈阳橙'], 200, 1, 'color', {colors: ['#ff9500','#ffcc00']});
  add(['Toxic Lime','Limão Tóxico','Lima Tóxica','剧毒青柠'], 200, 1, 'color', {colors: ['#b6ff00','#1a8f00']});
  add(['Ocean Blue','Azul Oceano','Azul Océano','海洋蓝'], 200, 1, 'color', {colors: ['#0077ff','#00d4ff']});
  add(['Violet Dream','Sonho Violeta','Sueño Violeta','紫色梦境'], 250, 1, 'color', {colors: ['#7b2ff7','#f107a3']});
  add(['Candy','Doce','Caramelo','糖果'], 300, 1, 'color', {colors: ['#ff9ad5','#9afcff','#fff59a']});
  add(['Zebra','Zebra','Cebra','斑马'], 300, 1, 'color', {colors: ['#ffffff','#111111']});
  add(['Camo','Camuflado','Camuflaje','迷彩'], 300, 1, 'color', {colors: ['#4b5320','#8a9a5b','#2f3a1d']});
  add(['Sunset','Pôr do Sol','Atardecer','日落'], 400, 2, 'color', {colors: ['#ff512f','#f09819','#dd2476']});
  // Modelos
  add(['Bunny','Coelhinho','Conejito','兔子'], 900, 2, 'model', {colors: ['#ffffff','#ffe3ef'], head: 'bunny'});
  add(['Corgi','Corgi','Corgi','柯基'], 900, 2, 'model', {colors: ['#e8923a','#ffffff'], head: 'dog'});
  add(['Rainbow Orb','Orbe Arco-íris','Orbe Arcoíris','彩虹球'], 1200, 2, 'model', {anim: 'rainbow', band: 2});
  add(['Lion King','Rei Leão','Rey León','狮子王'], 1800, 3, 'model', {colors: ['#d9a441','#c98a2b'], head: 'lion', magnet: 20});
  add(['Angel Cat','Gato Anjo','Gato Ángel','天使猫'], 1800, 3, 'model', {colors: ['#ffffff','#bfe7ff','#fff6c2'], head: 'cat', halo: true, wings: '#ffffff'});
  add(['Unicorn','Unicórnio','Unicornio','独角兽'], 2500, 3, 'model', {colors: ['#ffffff','#ffc2ea','#d9c2ff'], head: 'unicorn', fx: 'sparkle'});
  add(['Fire Serpent','Serpente de Fogo','Serpiente de Fuego','火焰灵蛇'], 3500, 4, 'model', {anim: 'fire', head: 'flame', fx: 'fire', magnet: 40, tail: 'flame'});
  add(['Ice Dragon','Dragão de Gelo','Dragón de Hielo','冰龙'], 3500, 4, 'model', {colors: ['#e9fbff','#9fe8ff','#4dc3ff','#2a7de1'], head: 'dragon', fx: 'ice', magnet: 40, spikes: '#e9fbff', tail: 'fin'});
  add(['Galaxy Void','Vazio Galáctico','Vacío Galáctico','银河虚空'], 5000, 4, 'model', {anim: 'galaxy', fx: 'stars', halo: true, magnet: 50});
  add(['Golden Emperor','Imperador Dourado','Emperador Dorado','黄金帝王'], 6000, 5, 'model', {colors: ['#fff2a8','#f3ba2f','#c78a00'], anim: 'flow', head: 'crown', fx: 'sparkle', magnet: 60});
  add(['Phoenix','Fênix','Fénix','凤凰'], 8000, 5, 'model', {anim: 'fire', head: 'flame', wings: '#ff7a00', fx: 'fire', magnet: 60, tail: 'flame'});

  // Novos formatos (cabeças/acessórios variados)
  add(['Poop','Cocô','Caca','便便'], 700, 2, 'model', {colors: ['#8a5a2b','#6b4423'], head: 'poop'});
  add(['Pirate Skull','Caveira Pirata','Calavera Pirata','海盗骷髅'], 800, 2, 'model', {colors: ['#1f1f1f','#d9d9d9','#1f1f1f','#b91c1c'], head: 'skull', eyes: 'none'});
  add(['Soccer Ball','Bola de Futebol','Balón de Fútbol','足球'], 700, 2, 'model', {colors: ['#ffffff','#111111'], head: 'soccer'});
  add(['Super Hero','Super-Herói','Superhéroe','超级英雄'], 1200, 2, 'model', {colors: ['#d62828','#555555'], head: 'cape'});
  add(['Butterfly','Borboleta','Mariposa','蝴蝶'], 1500, 3, 'model', {colors: ['#1d3bff','#10168a'], head: 'butterfly'});
  add(['Police','Polícia','Policía','警察'], 900, 2, 'model', {colors: ['#1e3a8a','#e5e7eb'], head: 'cop'});
  add(['Cool Shades','Óculos Escuros','Gafas de Sol','酷墨镜'], 800, 2, 'model', {colors: ['#ff7a00','#ffd23f'], head: 'shades', eyes: 'none'});
  add(['Pizza','Pizza','Pizza','披萨'], 800, 2, 'model', {colors: ['#f4b942','#c0392b','#f4b942','#8b5e34'], head: 'pizza'});
  add(['Love Heart','Coração','Corazón','爱心'], 900, 2, 'model', {colors: ['#ff4d8d','#ff9ac1'], head: 'heart'});
  add(['Pumpkin','Abóbora','Calabaza','南瓜'], 1000, 2, 'model', {colors: ['#ff7a00','#2b2b2b'], head: 'pumpkin'});
  add(['Robot','Robô','Robot','机器人'], 1500, 3, 'model', {colors: ['#9aa3b8','#4b5563'], head: 'robot', eyes: 'robot'});
  add(['Ninja','Ninja','Ninja','忍者'], 1500, 3, 'model', {colors: ['#111111','#b91c1c'], head: 'ninja', thick: .9});
  add(['Viking','Viking','Vikingo','维京人'], 2000, 3, 'model', {colors: ['#8d5524','#d9a441'], head: 'viking'});
  add(['Wizard','Mago','Mago','巫师'], 2200, 3, 'model', {colors: ['#4c1d95','#7c3aed','#fbbf24'], head: 'wizard', fx: 'stars'});
  add(['Alien','Alienígena','Alienígena','外星人'], 1800, 3, 'model', {colors: ['#7CFC00','#2e8b57'], head: 'alien', eyes: 'alien'});
  add(['Ghost','Fantasma','Fantasma','幽灵'], 1500, 3, 'model', {colors: ['#ffffff','#dbe4f0'], head: 'ghost', thick: 1.1, fx: 'stars'});
  add(['Shark','Tubarão','Tiburón','鲨鱼'], 2500, 3, 'model', {colors: ['#6b7f95','#cfd8dc'], head: 'shark', thick: 1.15, tail: 'fin', spikes: '#475569'});
  add(['Cosmic Dragon','Dragão Cósmico','Dragón Cósmico','宇宙之龙'], 9000, 5, 'model', {anim: 'galaxy', head: 'dragon', halo: true, spikes: '#b9a2ff', tail: 'flame', fx: 'stars', magnet: 60});

  const hsl = h => { const s = .9, l = .55, a = s * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join(''); };
  const PAL = {fire: ['#fff3a0','#ffb300','#ff6a00','#e63900'], galaxy: ['#1b1464','#4b2bb3','#9b5de5','#00d4ff','#ffffff']};
  function colorAt(sk, c, now) {   // cor do segmento c; animações usam poucas cores (cache de sprites)
    const n = Math.floor(c / sk.band);
    if (sk.anim === 'rainbow') return hsl((Math.round(((c * 14 + now * .08) % 360) / 10) * 10) % 360);
    if (sk.anim === 'fire') return PAL.fire[(n + Math.floor(now / 100)) % 4];
    if (sk.anim === 'galaxy') return PAL.galaxy[(n * 7 + Math.floor(now / 400)) % 5];
    if (sk.anim === 'flow') return sk.colors[(n + Math.floor(now / 150)) % sk.colors.length];
    return sk.colors[n % sk.colors.length];
  }
  const ell = (c, x, y, rx, ry, rot, fill) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, 6.2832); c.fillStyle = fill; c.fill(); };
  const poly = (c, pts, fill) => { c.beginPath(); pts.forEach(([x, y], i) => c[i ? 'lineTo' : 'moveTo'](x, y)); c.closePath(); c.fillStyle = fill; c.fill(); };
  const HEADS = {
    bunny(c, r) { for (const s of [-1, 1]) { ell(c, -r * .9, s * r * .7, r * 1.4, r * .38, s * .45, '#ffffff'); ell(c, -r * .9, s * r * .7, r, r * .2, s * .45, '#ffb3d1'); } },
    dog(c, r) { for (const s of [-1, 1]) ell(c, -r * .1, s * r * 1.05, r * .55, r * .8, -s * .4, '#8a4b12'); },
    cat(c, r) { for (const s of [-1, 1]) poly(c, [[r * .1, s * r * .5], [r * .2, s * r * 1.4], [-r * .6, s * r * .8]], '#ffffff'); },
    unicorn(c, r) { for (const s of [-1, 1]) poly(c, [[r * .1, s * r * .5], [r * .1, s * r * 1.2], [-r * .5, s * r * .7]], '#ffffff'); poly(c, [[r * .6, -r * .25], [r * 2.2, 0], [r * .6, r * .25]], '#ffd23f'); },
    lion(c, r) { for (let i = 0; i < 10; i++) { const a = i / 10 * 6.2832; ell(c, Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05, r * .5, r * .5, 0, i % 2 ? '#a8641a' : '#c98a2b'); } },
    dragon(c, r) { for (const s of [-1, 1]) { poly(c, [[r * .3, s * r * .6], [-r * .9, s * r * 1.7], [-r * .5, s * r * .5]], '#e9fbff'); poly(c, [[r * .9, s * r * .2], [r * 1.6, s * r * .35], [r * .9, s * r * .45]], '#9fe8ff'); } },
    crown(c, r) { for (let i = 0; i < 5; i++) { const a = i / 5 * 6.2832; poly(c, [[Math.cos(a - .25) * r * .8, Math.sin(a - .25) * r * .8], [Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5], [Math.cos(a + .25) * r * .8, Math.sin(a + .25) * r * .8]], '#ffd23f'); } },
    flame(c, r, now) { for (let i = 0; i < 6; i++) { const a = Math.PI + (i - 2.5) * .5, L = r * (1.5 + .4 * Math.sin((now || 0) / 90 + i * 2));
      poly(c, [[Math.cos(a - .2) * r * .7, Math.sin(a - .2) * r * .7], [Math.cos(a) * L, Math.sin(a) * L], [Math.cos(a + .2) * r * .7, Math.sin(a + .2) * r * .7]], i % 2 ? '#ffb300' : '#ff6a00'); } },
    poop(c, r) { ell(c, -r * .15, 0, r * 1.3, r * 1.05, 0, '#6b3f1d'); ell(c, -r * .1, 0, r * .98, r * .78, 0, '#7f4c24'); ell(c, 0, 0, r * .62, r * .5, 0, '#965f30'); poly(c, [[r * .1, -r * .16], [r * 1.6, 0], [r * .1, r * .16]], '#a86f3a'); },
    skull(c, r) { ell(c, 0, 0, r * 1.4, r * 1.3, 0, '#f1f1f1'); ell(c, r * .6, 0, r * .6, r * .85, 0, '#e2e2e2');
      ell(c, r * .3, -r * .5, r * .38, r * .34, .3, '#111'); ell(c, r * .3, r * .5, r * .38, r * .34, -.3, '#111'); poly(c, [[r * .95, 0], [r * .7, -r * .13], [r * .7, r * .13]], '#111');
      c.fillStyle = '#111'; for (let i = -2; i <= 2; i++) c.fillRect(r * 1.05, i * r * .2 - r * .03, r * .28, r * .06); },
    soccer(c, r) { ell(c, 0, 0, r * 1.3, r * 1.3, 0, '#ffffff'); const pent = (x, y, s, rot) => poly(c, [0, 1, 2, 3, 4].map(i => [x + Math.cos(rot + i * 1.2566) * s, y + Math.sin(rot + i * 1.2566) * s]), '#111');
      pent(0, 0, r * .45, 0); for (let i = 0; i < 5; i++) { const a = i * 1.2566 + .6; pent(Math.cos(a) * r * 1.0, Math.sin(a) * r * 1.0, r * .26, a); } },
    cape(c, r) { poly(c, [[-r * .1, -r * .9], [-r * 3.3, -r * 1.7], [-r * 3, 0], [-r * 3.3, r * 1.7], [-r * .1, r * .9]], '#e11d48'); poly(c, [[-r * .1, -r * .9], [-r * 1.9, -r * .2], [-r * 1.9, r * .2], [-r * .1, r * .9]], '#9f1239'); },
    butterfly(c, r) { for (const s of [-1, 1]) { ell(c, -r * .2, s * r * 1.9, r * 1.9, r, -s * .55, '#2a56ff'); ell(c, -r, s * r * 1.5, r * 1.2, r * .7, s * .5, '#1a2fb5'); ell(c, -r * .4, s * r * 2, r * .5, r * .4, 0, '#9db6ff');
      c.strokeStyle = '#111'; c.lineWidth = 2; c.beginPath(); c.moveTo(r * .6, s * r * .3); c.lineTo(r * 1.7, s * r * .9); c.stroke(); } },
    cop(c, r) { ell(c, -r * .4, 0, r * .95, r * .95, 0, '#1e3a8a'); ell(c, -r * .4, 0, r * .68, r * .68, 0, '#27439f'); ell(c, -r * .1, 0, r * .27, r * .27, 0, '#ffd23f'); ell(c, r * .2, 0, r * .3, r * .9, 0, '#0f172a'); },
    shades(c, r) { ell(c, r * .5, -r * .5, r * .55, r * .46, 0, '#0b0b0b'); ell(c, r * .5, r * .5, r * .55, r * .46, 0, '#0b0b0b'); c.fillStyle = '#0b0b0b'; c.fillRect(r * .3, -r * .08, r * .4, r * .16); ell(c, r * .35, -r * .66, r * .16, r * .08, .6, 'rgba(255,255,255,.6)'); ell(c, r * .35, r * .34, r * .16, r * .08, .6, 'rgba(255,255,255,.6)'); },
    pizza(c, r) { poly(c, [[r * 2.1, 0], [-r * .2, -r * 1.3], [-r * .2, r * 1.3]], '#f4b942'); poly(c, [[-r * .2, -r * 1.3], [-r * .55, -r * 1.25], [-r * .55, r * 1.25], [-r * .2, r * 1.3]], '#c68642');
      for (const [x, y] of [[.5, -.2], [1, .35], [.1, .5], [1.2, -.4]]) ell(c, r * x, r * y, r * .26, r * .26, 0, '#c0392b'); },
    heart(c, r) { ell(c, -r * .1, -r * .6, r * .8, r * .8, 0, '#ff3d7f'); ell(c, -r * .1, r * .6, r * .8, r * .8, 0, '#ff3d7f'); poly(c, [[r * 1.7, 0], [-r * .2, -r * 1.25], [-r * .2, r * 1.25]], '#ff3d7f'); ell(c, -r * .2, -r * .85, r * .3, r * .18, .5, 'rgba(255,255,255,.55)'); },
    pumpkin(c, r) { ell(c, 0, 0, r * 1.4, r * 1.3, 0, '#ff7a00'); c.strokeStyle = '#c2410c'; c.lineWidth = 2; for (const k of [-.55, 0, .55]) { c.beginPath(); c.ellipse(0, 0, r * 1.4, r * (1.3 + k * .0), 0, 0, 0); c.moveTo(-r * 1.3, k * r * 1.1); c.lineTo(r * 1.3, k * r * 1.1); c.stroke(); } c.fillStyle = '#2f7d32'; c.fillRect(-r * 1.25, -r * .15, r * .5, r * .3); },
    robot(c, r) { c.fillStyle = '#9aa3b8'; c.fillRect(-r * 1.1, -r * 1.2, r * 2.5, r * 2.4); c.strokeStyle = '#4b5563'; c.lineWidth = 2; c.strokeRect(-r * 1.1, -r * 1.2, r * 2.5, r * 2.4);
      c.beginPath(); c.moveTo(-r * 1.1, 0); c.lineTo(-r * 1.8, 0); c.stroke(); ell(c, -r * 1.85, 0, r * .25, r * .25, 0, '#ff2a2a'); },
    ninja(c, r) { c.fillStyle = '#b91c1c'; c.fillRect(-r * .55, -r * 1.1, r * .45, r * 2.2); poly(c, [[-r * .55, 0], [-r * 2, -r * .6], [-r * 1.8, -r * .05]], '#b91c1c'); poly(c, [[-r * .55, 0], [-r * 2.1, r * .5], [-r * 1.8, r * .05]], '#991b1b'); },
    viking(c, r) { for (const s of [-1, 1]) poly(c, [[-r * .1, s * r * .8], [-r * .9, s * r * 2.2], [r * .2, s * r * 1.5]], '#f5e6c8'); ell(c, -r * .35, 0, r * .95, r * .95, 0, '#8d99ae'); ell(c, -r * .35, 0, r * .35, r * .35, 0, '#cbd5e1'); },
    wizard(c, r) { ell(c, -r * .4, 0, r * 1.6, r * 1.6, 0, '#4c1d95'); ell(c, -r * .4, 0, r * .9, r * .9, 0, '#6d28d9'); ell(c, -r * .4, 0, r * .3, r * .3, 0, '#fbbf24'); },
    alien(c, r) { ell(c, 0, 0, r * 1.5, r * 1.2, 0, '#86e34a'); for (const s of [-1, 1]) { c.strokeStyle = '#2e8b57'; c.lineWidth = 2; c.beginPath(); c.moveTo(-r * .4, s * r * .6); c.lineTo(-r * 1.4, s * r * 1.4); c.stroke(); ell(c, -r * 1.45, s * r * 1.45, r * .25, r * .25, 0, '#fde047'); } },
    ghost(c, r) { ell(c, 0, 0, r * 1.4, r * 1.4, 0, 'rgba(255,255,255,.92)'); for (const s of [-1, 1]) ell(c, r * .75, s * r * .95, r * .22, r * .15, 0, 'rgba(255,150,170,.8)'); },
    shark(c, r) { poly(c, [[r * 1.9, 0], [r * .6, -r * .75], [r * .6, r * .75]], '#6b7f95'); poly(c, [[r * .3, -r * .15], [-r * 1.7, 0], [r * .3, r * .15]], '#475569'); }
  };
  function drawHead(c, sk, r, now) {   // ctx já transladado/rotacionado para a cabeça (frente = +x)
    if (sk.wings) for (const s of [-1, 1]) ell(c, -r * .2, s * r * 1.5, r * 1.5, r * .5, -s * .7, sk.wings);
    const H = HEADS[sk.head]; if (H) H(c, r, now);
    if (sk.halo) { c.beginPath(); c.arc(0, 0, r * 1.25, 0, 6.2832); c.strokeStyle = '#ffe27a'; c.lineWidth = 2.5; c.stroke(); }
  }
  function eyes(c, sk, r) {
    const k = sk.eyes || '';
    if (k === 'none') return;
    if (k === 'robot') { for (const s of [-1, 1]) { c.fillStyle = '#ff2a2a'; c.fillRect(r * .3, s * r * .5 - r * .18, r * .5, r * .36); } return; }
    if (k === 'alien') { for (const s of [-1, 1]) { ell(c, r * .5, s * r * .55, r * .55, r * .32, -s * .5, '#0a0a0a'); ell(c, r * .65, s * r * .5, r * .12, r * .08, 0, '#ffffff'); } return; }
    for (const s of [-1, 1]) {
      c.beginPath(); c.arc(r * .45, s * r * .5, r * .42, 0, 6.2832); c.fillStyle = '#fff'; c.fill();
      c.beginPath(); c.arc(r * .6, s * r * .5, r * .2, 0, 6.2832); c.fillStyle = '#000'; c.fill();
      c.beginPath(); c.arc(r * .66, s * r * .44, r * .07, 0, 6.2832); c.fillStyle = '#fff'; c.fill();
    }
  }
  function drawSpikes(c, sk, sg, r, vis) {   // espinhos ao longo do corpo (coords do mundo)
    for (let i = 4; i < sg.length - 3; i += 4) {
      const s = sg[i]; if (!vis(s)) continue;
      const p = sg[i - 1], q = sg[i + 1], a = Math.atan2(q.y - p.y, q.x - p.x) + 1.5708, nx = Math.cos(a), ny = Math.sin(a), k = i / sg.length > .65 ? .7 : 1;
      for (const d of [-1, 1]) poly(c, [[s.x + nx * d * r * .7 - ny * r * .25, s.y + ny * d * r * .7 + nx * r * .25], [s.x + nx * d * r * 1.7 * k, s.y + ny * d * r * 1.7 * k], [s.x + nx * d * r * .7 + ny * r * .25, s.y + ny * d * r * .7 - nx * r * .25]], sk.spikes);
    }
  }
  function drawTail(c, sk, r, now) {   // origem no fim da cauda, +x aponta para trás
    const L = r * 2.4, w = r * 1.4;
    if (sk.tail === 'fin') poly(c, [[0, -r * .3], [L, -w], [L * .65, 0], [L, w], [0, r * .3]], sk.spikes || sk.colors[sk.colors.length - 1]);
    else for (let i = -1; i <= 1; i++) { const l = L * (1 + .3 * Math.sin((now || 0) / 80 + i * 2)); poly(c, [[0, i * r * .5 - r * .3], [l, i * r * .8], [0, i * r * .5 + r * .3]], i ? '#ffb300' : '#ff6a00'); }
  }
  function preview(cv, sk, now) {   // miniatura da loja
    const c = cv.getContext('2d'), H = cv.height, r = 11 * (sk.thick || 1), n = 11; c.clearRect(0, 0, cv.width, H);
    const P = i => [26 + i * 13, H / 2 + Math.sin(i * .75) * 7];
    for (let i = 0; i < n; i++) {
      const [x, y] = P(i), rr = r * (i < 3 ? .6 + i * .13 : 1), g = c.createRadialGradient(x - 3, y - 3, 1, x, y, rr);
      g.addColorStop(0, 'rgba(255,255,255,.7)'); g.addColorStop(.5, colorAt(sk, i + 20, now || 0)); g.addColorStop(1, 'rgba(0,0,0,.4)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, rr, 0, 6.2832); c.fill();
    }
    const [hx, hy] = P(n - 1); c.save(); c.translate(hx, hy); drawHead(c, sk, r, now); eyes(c, sk, r); c.restore();
  }
  window.SKINS = S;
  window.Skins = {colorAt, drawHead, eyes, drawSpikes, drawTail, preview, TIER, TIER_COLORS, TABS, FREE, FX,
    name: (sk, l) => sk.n[l] || sk.n[0], perk: (sk, l) => COSM[l] + (sk.magnet ? ' + +' + sk.magnet + ' ' + MAG[l] : '')};
})();
