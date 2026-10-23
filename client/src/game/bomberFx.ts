// Efeitos visuais reutilizaveis dos BOMBERS. Imagens e textos sao reaproveitados (pool com teto): nada e criado
// "para sempre" a cada ataque e, se o pool esgotar, o efeito e simplesmente pulado (so enfeite, nunca bloqueia o jogo).
import Phaser from "phaser";

export interface FxImage {
  texture: string; x: number; y: number; tint?: number; scale?: number; toScale?: number; alpha?: number;
  duration: number; depth?: number; angle?: number; dx?: number; dy?: number; add?: boolean; flipX?: boolean;
}
export interface FxText { x: number; y: number; text: string; color?: string; size?: number; rise?: number; duration?: number }

export class FxPool {
  private freeImg: Phaser.GameObjects.Image[] = [];
  private allImg: Phaser.GameObjects.Image[] = [];
  private freeTxt: Phaser.GameObjects.Text[] = [];
  private allTxt: Phaser.GameObjects.Text[] = [];

  constructor(private scene: Phaser.Scene, private maxImages = 140, private maxTexts = 40) {}

  image(o: FxImage) {
    let img: Phaser.GameObjects.Image | undefined = this.freeImg.pop();
    if (!img) {
      if (this.allImg.length >= this.maxImages) return;
      const made: Phaser.GameObjects.Image = this.scene.add.image(0, 0, o.texture);
      this.allImg.push(made);
      img = made;
    }
    const s = o.scale ?? 1;
    img.setTexture(o.texture).setPosition(o.x, o.y).setTint(o.tint ?? 0xffffff).setScale(s).setAlpha(o.alpha ?? 1)
      .setAngle(o.angle ?? 0).setDepth(o.depth ?? 5).setFlipX(o.flipX ?? false)
      .setBlendMode(o.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL).setVisible(true).setActive(true);
    const me: Phaser.GameObjects.Image = img;
    this.scene.tweens.add({
      targets: me, scale: o.toScale ?? s, alpha: 0, x: o.x + (o.dx ?? 0), y: o.y + (o.dy ?? 0), duration: o.duration,
      onComplete: () => { me.setVisible(false).setActive(false); this.freeImg.push(me); },
    });
  }

  text(o: FxText) {
    let t: Phaser.GameObjects.Text | undefined = this.freeTxt.pop();
    if (!t) {
      if (this.allTxt.length >= this.maxTexts) return;
      const made: Phaser.GameObjects.Text = this.scene.add.text(0, 0, "", { fontFamily: "monospace", fontSize: "12px", color: "#ffffff", stroke: "#000", strokeThickness: 3 }).setOrigin(0.5);
      this.allTxt.push(made);
      t = made;
    }
    t.setText(o.text).setColor(o.color ?? "#ffffff").setFontSize(o.size ?? 12).setPosition(o.x, o.y).setAlpha(1).setDepth(8).setVisible(true).setActive(true);
    const me: Phaser.GameObjects.Text = t;
    this.scene.tweens.add({
      targets: me, y: o.y - (o.rise ?? 20), alpha: 0, duration: o.duration ?? 700,
      onComplete: () => { me.setVisible(false).setActive(false); this.freeTxt.push(me); },
    });
  }

  /** Destroi tudo (fim da cena). */
  destroy() {
    [...this.allImg, ...this.allTxt].forEach((o) => { this.scene.tweens.killTweensOf(o); o.destroy(); });
    this.allImg = []; this.allTxt = []; this.freeImg = []; this.freeTxt = [];
  }
}
