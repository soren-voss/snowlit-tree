import { MathUtils, Raycaster, Vector2, Vector3 } from 'three';
import type { CameraPose, SceneCamera } from '../core/camera';
import type { Rendering } from '../core/rendering';
import { call, ease, parallel, sequence, Timeline, tween, wait } from '../core/timeline';
import type { Clip } from '../core/timeline';
import type { GiftBox } from '../scene/gifts/boxes';
import type { GiftReveal } from '../scene/gifts/reveal';
import { groundHeight } from '../scene/landscape';
import { GiftCard } from '../ui/gift-card';

type Inspection = 'opening' | 'card' | 'closing' | 'rewrapping';

function approach(box: GiftBox): CameraPose {
  const outward = new Vector3(box.anchor.x, 0, box.anchor.z).normalize();
  const sideways = new Vector3(outward.z, 0, -outward.x);
  const position = box.anchor.clone().addScaledVector(outward, 5.1).addScaledVector(sideways, .35);
  position.y = groundHeight(position.x, position.z) + 1.45 + box.height;
  const target = box.anchor.clone();
  target.y += box.height * .5 + .78;
  return { position, target };
}

function cameraMove(view: SceneCamera, start: CameraPose, end: CameraPose, seconds: number): Clip {
  const angle = Math.atan2(start.position.x, start.position.z);
  const endAngle = Math.atan2(end.position.x, end.position.z);
  const sweep = Math.atan2(Math.sin(endAngle - angle), Math.cos(endAngle - angle));
  const beginRadius = Math.hypot(start.position.x, start.position.z);
  const endRadius = Math.hypot(end.position.x, end.position.z);
  const pose: CameraPose = { position: new Vector3(), target: new Vector3() };
  return tween(seconds, progress => {
    const a = angle + sweep * progress;
    const radius = MathUtils.lerp(beginRadius, endRadius, progress);
    pose.position.set(Math.sin(a) * radius, MathUtils.lerp(start.position.y, end.position.y, progress), Math.cos(a) * radius);
    pose.target.copy(start.target).lerp(end.target, progress);
    view.setInspectionPose(pose);
  }, ease.smooth);
}

export class GiftExperience {
  dim = 0;
  private readonly card: GiftCard;
  private readonly ray = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly byHit = new Map<GiftBox['hit'], GiftBox>();
  private readonly contacts = new Set<number>();
  private hovered?: GiftBox;
  private pressed?: { id: number; box: GiftBox; x: number; y: number };
  private active?: GiftBox;
  private state?: Inspection;
  private timeline?: Timeline;
  private closePose?: CameraPose;

  constructor(
    private readonly boxes: readonly GiftBox[],
    private readonly reveal: GiftReveal,
    private readonly view: SceneCamera,
    private readonly rendering: Rendering,
    private readonly canvas: HTMLCanvasElement,
    dialog: HTMLDialogElement,
    private readonly canPick: () => boolean,
  ) {
    for (const box of boxes) this.byHit.set(box.hit, box);
    this.card = new GiftCard(dialog, () => this.close(), () => { if (this.active) this.rewrap(this.active.data.id); });
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('lostpointercapture', this.onCancel);
    canvas.addEventListener('pointerleave', () => this.highlight(undefined));
  }

  summary(): { id: string; name: string; opened: boolean }[] {
    return this.boxes.map(box => ({ id: box.data.id, name: box.data.name, opened: box.opened }));
  }

  update(time: number, delta: number, ratio: number): void {
    this.reveal.setPixelRatio(ratio);
    this.reveal.tick(delta);
    if (this.timeline?.update(delta)) this.timeline = undefined;
    for (const box of this.boxes) box.update(time, delta, this.hovered === box);
  }

  open(id: string): boolean {
    if (this.state || !this.canPick()) return false;
    const box = this.boxes.find(gift => gift.data.id === id);
    if (!box) return false;

    this.state = 'opening';
    this.active = box;
    this.highlight(undefined);
    this.pressed = undefined;
    this.contacts.clear();
    this.card.prepare(box.data);
    const start = this.view.beginInspection();
    this.closePose = box.opened ? start : approach(box);
    this.reveal.prepare(box);
    if (box.opened) {
      this.rendering.setFocus(box.openPoint);
      this.dim = 1;
      this.showCard(box);
      return true;
    }

    this.timeline = new Timeline(sequence(
      cameraMove(this.view, start, this.closePose, 1.2),
      tween(.56, value => {
        box.wrap.rotation.z = Math.sin(value * Math.PI * 4) * Math.sin(value * Math.PI) * .106;
        box.wrap.rotation.y = -Math.sin(value * Math.PI * 4) * Math.sin(value * Math.PI) * .07;
      }),
      tween(.62, value => { box.release = value; }, ease.smooth),
      parallel(
        tween(.8, value => { box.lidTravel = value; }, ease.smooth),
        sequence(wait(.3), call(() => this.reveal.burstOut()), tween(.5, value => this.reveal.beamStrength(Math.sin(value * Math.PI * .5)))),
      ),
      call(() => this.rendering.setFocus(this.reveal.card)),
      parallel(
        tween(1.2, value => this.reveal.placeCard(box, this.view.camera, value, Math.min(1, value * 4)), ease.outCubic),
        tween(1.4, value => this.reveal.beamStrength((1 - value) ** 1.6)),
        tween(1.0, value => { this.dim = value; }, ease.smooth),
      ),
      call(() => this.showCard(box)),
      tween(.30, value => this.reveal.placeCard(box, this.view.camera, 1, 1 - value)),
      call(() => this.reveal.hideCard()),
    ));
    return true;
  }

  close(): boolean {
    if (this.state !== 'card' || !this.active || !this.closePose) return false;
    this.dismiss(this.active, this.closePose, false);
    return true;
  }

  rewrap(id: string): boolean {
    if (!this.canPick()) return false;
    if (this.state === 'card' && this.active?.data.id === id && this.closePose) {
      this.dismiss(this.active, this.closePose, true);
      return true;
    }
    if (this.state) return false;
    const box = this.boxes.find(gift => gift.data.id === id);
    if (!box?.opened) return false;
    this.state = 'rewrapping';
    this.highlight(undefined);
    this.timeline = new Timeline(sequence(this.repack(box), call(() => this.finish())));
    return true;
  }

  private showCard(box: GiftBox): void {
    box.opened = true;
    this.state = 'card';
    this.card.show();
  }

  private dismiss(box: GiftBox, pose: CameraPose, repack: boolean): void {
    this.state = repack ? 'rewrapping' : 'closing';
    this.card.startClosing();
    this.timeline = new Timeline(sequence(
      wait(.23),
      call(() => {
        this.card.hide();
        this.canvas.focus({ preventScroll: true });
        this.reveal.placeCard(box, this.view.camera, 1, .93);
        this.rendering.setFocus(this.reveal.card);
      }),
      tween(.43, value => {
        this.dim = 1 - value;
        this.reveal.placeCard(box, this.view.camera, 1 - value, (1 - value) * .93);
        if (!repack) box.marker = value ** 1.45;
      }, ease.smooth),
      call(() => {
        this.reveal.hideCard();
        this.reveal.stopBurst();
        this.reveal.beamStrength(0);
        this.rendering.clearFocus();
      }),
      parallel(
        cameraMove(this.view, pose, this.view.orbitPose(), .68),
        repack ? this.repack(box) : wait(.68),
      ),
      call(() => { this.view.endInspection(); this.finish(); }),
    ));
  }

  private repack(box: GiftBox): Clip {
    const marker = box.marker;
    return sequence(
      parallel(
        tween(.73, value => { box.lidTravel = 1 - value; box.marker = marker * (1 - value); }, ease.smooth),
        sequence(wait(.37), tween(.46, value => { box.release = 1 - value; }, ease.smooth)),
      ),
      call(() => { box.opened = false; }),
    );
  }

  private finish(): void {
    this.active = undefined;
    this.state = undefined;
    this.closePose = undefined;
  }

  private highlight(box: GiftBox | undefined): void {
    this.hovered = box;
    this.canvas.toggleAttribute('data-gift-target', !!box);
  }

  private pick(event: PointerEvent): GiftBox | undefined {
    const bounds = this.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height || event.clientX < bounds.left || event.clientX >= bounds.right ||
      event.clientY < bounds.top || event.clientY >= bounds.bottom) return undefined;
    this.pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, 1 - ((event.clientY - bounds.top) / bounds.height) * 2);
    this.ray.setFromCamera(this.pointer, this.view.camera);
    const hits = [...this.byHit.keys()];
    for (const hit of hits) hit.updateWorldMatrix(true, false);
    const hit = this.ray.intersectObjects(hits, false)[0];
    return hit ? this.byHit.get(hit.object as GiftBox['hit']) : undefined;
  }

  private onDown = (event: PointerEvent) => {
    if (this.state || !this.canPick() || event.button !== 0) return;
    this.contacts.add(event.pointerId);
    const box = this.contacts.size === 1 ? this.pick(event) : undefined;
    this.pressed = box ? { id: event.pointerId, box, x: event.clientX, y: event.clientY } : undefined;
    this.highlight(box);
  };

  private onMove = (event: PointerEvent) => {
    if (this.state || !this.canPick()) return;
    if (this.pressed?.id === event.pointerId && Math.hypot(event.clientX - this.pressed.x, event.clientY - this.pressed.y) > 8) {
      this.pressed = undefined;
      this.highlight(undefined);
    }
    if (this.contacts.size === 0 && event.pointerType !== 'touch') this.highlight(this.pick(event));
  };

  private onUp = (event: PointerEvent) => {
    this.contacts.delete(event.pointerId);
    if (this.state || !this.canPick()) return;
    const press = this.pressed;
    this.pressed = undefined;
    const box = this.pick(event);
    if (press?.id === event.pointerId && press.box === box && Math.hypot(event.clientX - press.x, event.clientY - press.y) <= 8) {
      this.open(press.box.data.id);
    } else this.highlight(event.pointerType !== 'touch' && this.contacts.size === 0 ? box : undefined);
  };

  private onCancel = (event: PointerEvent) => {
    if (!this.contacts.delete(event.pointerId)) return;
    if (this.pressed?.id === event.pointerId) this.pressed = undefined;
    this.highlight(undefined);
  };
}
