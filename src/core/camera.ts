import { MathUtils, PerspectiveCamera, Vector3 } from 'three';

const { clamp, lerp, degToRad } = MathUtils;
const IDLE_SECONDS = 8;
const MIN_ELEVATION = degToRad(-23);
const MAX_ELEVATION = degToRad(35);

export class SceneCamera {
  readonly camera = new PerspectiveCamera(36, 1, 0.16, 165);
  enabled = false;
  orbiting = false;
  private readonly target = new Vector3();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private angle = 0;
  private elevation = 0;
  private zoom = 1;
  private framingDistance = 16.8;
  private idle = 0;
  private drift = 0;
  private panX = 0;
  private panY = 0;
  private zoomVelocity = 0;
  private portrait = 0;
  private progress = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('lostpointercapture', this.onUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    this.setIntro(0);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.portrait = clamp((1 - this.camera.aspect) / 0.44, 0, 1);
    this.camera.fov = lerp(36, 44, this.portrait);
    const visibleWidth = 7.5 / (2 * Math.tan(degToRad(this.camera.fov / 2)) * this.camera.aspect);
    this.framingDistance = Math.max(lerp(17.6, 15.2, this.portrait), visibleWidth);
    this.camera.updateProjectionMatrix();
    if (!this.enabled) this.setIntro(this.progress);
    else this.applyPose();
  }

  setIntro(progress: number): void {
    this.progress = progress;
    this.angle = lerp(lerp(-0.09, 0.02, this.portrait), lerp(0.12, 0.085, this.portrait), progress);
    this.elevation = lerp(-0.114, -0.041, progress);
    this.zoom = lerp(lerp(0.78, 0.92, this.portrait), 1, progress);
    this.target.set(0, lerp(4.25, 3.94, progress), 0);
    this.applyPose();
  }

  update(delta: number): void {
    if (!this.enabled) return;
    if (this.pointers.size === 0) this.idle += delta;
    this.orbiting = this.idle >= IDLE_SECONDS && !this.reducedMotion.matches;
    this.drift = MathUtils.damp(this.drift, this.orbiting ? 0.065 : 0, 2.6, delta);

    const decay = Math.exp(-delta * 8.5);
    this.angle += this.panX * (1 - decay) + this.drift * delta;
    this.elevation = clamp(this.elevation + this.panY * (1 - decay), MIN_ELEVATION, MAX_ELEVATION);
    this.panX *= decay;
    this.panY *= decay;
    this.zoom = clamp(this.zoom * Math.exp(this.zoomVelocity * (1 - decay)), 0.51, 1.63);
    this.zoomVelocity *= decay;
    this.applyPose();
  }

  private applyPose(): void {
    const distance = this.framingDistance * this.zoom;
    const radius = distance * Math.cos(this.elevation);
    this.camera.position.set(radius * Math.sin(this.angle), Math.max(0.72, this.target.y + distance * Math.sin(this.elevation)), radius * Math.cos(this.angle));
    this.camera.lookAt(this.target);
  }

  private wake(): void {
    this.idle = 0;
    this.drift = 0;
    this.orbiting = false;
  }

  private onDown = (event: PointerEvent): void => {
    if (!this.enabled || event.pointerType === 'mouse' && event.button !== 0 || this.pointers.size === 2) return;
    this.wake();
    this.panX = this.panY = this.zoomVelocity = 0;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.canvas.setPointerCapture(event.pointerId);
  };

  private onMove = (event: PointerEvent): void => {
    const previous = this.pointers.get(event.pointerId);
    if (!this.enabled || !previous) return;
    this.wake();
    const x = event.clientX;
    const y = event.clientY;
    if (this.pointers.size === 2) {
      const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
      if (other) {
        const distance = Math.hypot(x - other.x, y - other.y);
        const before = Math.hypot(previous.x - other.x, previous.y - other.y);
        const amount = Math.log(Math.max(12, before) / Math.max(12, distance));
        this.zoom = clamp(this.zoom * Math.exp(amount), 0.51, 1.63);
        this.zoomVelocity = clamp(amount * 0.64, -0.1, 0.1);
      }
    } else {
      const xChange = (previous.x - x) * 0.005;
      const yChange = (y - previous.y) * 0.0026;
      this.angle += xChange;
      this.elevation = clamp(this.elevation + yChange, MIN_ELEVATION, MAX_ELEVATION);
      this.panX = clamp(xChange * 1.4, -0.16, 0.16);
      this.panY = clamp(yChange * 1.3, -0.09, 0.09);
    }
    previous.x = x;
    previous.y = y;
    this.applyPose();
  };

  private onUp = (event: PointerEvent): void => {
    if (this.pointers.delete(event.pointerId)) this.wake();
  };

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    if (!this.enabled) return;
    this.wake();
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.canvas.clientHeight : 1;
    this.zoomVelocity = clamp(this.zoomVelocity + event.deltaY * scale * 0.00125, -0.26, 0.26);
  };
}
