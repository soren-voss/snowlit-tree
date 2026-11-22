import { MathUtils, PerspectiveCamera, Vector3 } from 'three';

const { clamp, lerp, degToRad } = MathUtils;
const IDLE_SECONDS = 8;
const MIN_ELEVATION = degToRad(-23);
const MAX_ELEVATION = degToRad(35);

export interface CameraPose {
  position: Vector3;
  target: Vector3;
}

export class SceneCamera {
  readonly camera = new PerspectiveCamera(36, 1, 0.16, 165);
  enabled = false;
  orbiting = false;
  /** Starts the slow orbit without waiting for the idle timeout (recording demo). */
  autoOrbit = false;
  orbitSpeed = .065;
  private inspecting = false;
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
  private width = 1;
  private height = 1;
  private readonly inset = { right: 0, bottom: 0, targetRight: 0, targetBottom: 0 };

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
    this.width = width;
    this.height = height;
    this.frame();
  }

  /** Reserves screen space for a side panel (right) or bottom sheet; the tree is framed in what remains. */
  setInset(right: number, bottom: number): void {
    this.inset.targetRight = right;
    this.inset.targetBottom = bottom;
  }

  private frame(): void {
    const { right, bottom } = this.inset;
    const width = Math.max(1, this.width - right), height = Math.max(1, this.height - bottom);
    const aspect = width / height;
    this.camera.aspect = this.width / this.height;
    this.portrait = clamp((1 - aspect) / 0.44, 0, 1);
    const fov = degToRad(lerp(36, 44, this.portrait));
    this.camera.fov = MathUtils.radToDeg(2 * Math.atan(Math.tan(fov / 2) * this.height / height));
    const panel = Math.min(1, (right + bottom) / 160);
    const visibleWidth = lerp(7.5, 9.6, panel) / (2 * Math.tan(fov / 2) * aspect);
    this.framingDistance = Math.max(lerp(17.6, 15.2, this.portrait), visibleWidth);
    if (right + bottom > .5) this.camera.setViewOffset(this.width, this.height, right / 2, bottom / 2, this.width, this.height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    if (this.inspecting) return;
    if (!this.enabled) this.setIntro(this.progress);
    else this.applyPose();
  }

  setIntro(progress: number): void {
    this.progress = progress;
    this.angle = lerp(lerp(-0.09, 0.02, this.portrait), lerp(0.12, 0.055, this.portrait), progress);
    this.elevation = lerp(-0.114, -0.041, progress);
    this.zoom = lerp(lerp(0.78, 0.92, this.portrait), 1, progress);
    this.target.set(0, lerp(4.25, 3.94, progress), 0);
    this.applyPose();
  }

  update(delta: number): void {
    const { inset } = this;
    if (Math.abs(inset.right - inset.targetRight) + Math.abs(inset.bottom - inset.targetBottom) > .5) {
      inset.right = MathUtils.damp(inset.right, inset.targetRight, 7, delta);
      inset.bottom = MathUtils.damp(inset.bottom, inset.targetBottom, 7, delta);
      if (Math.abs(inset.right - inset.targetRight) + Math.abs(inset.bottom - inset.targetBottom) <= .5) {
        inset.right = inset.targetRight;
        inset.bottom = inset.targetBottom;
      }
      this.frame();
    }
    if (!this.enabled || this.inspecting) return;
    if (this.pointers.size === 0) this.idle += delta;
    this.orbiting = (this.idle >= IDLE_SECONDS || this.autoOrbit) && !this.reducedMotion.matches;
    this.drift = MathUtils.damp(this.drift, this.orbiting ? this.orbitSpeed : 0, 2.6, delta);

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
    this.placeOrbit(this.camera.position);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  orbitPose(): CameraPose {
    return { position: this.placeOrbit(new Vector3()), target: this.target.clone() };
  }

  private placeOrbit(position: Vector3): Vector3 {
    const distance = this.framingDistance * this.zoom;
    const radius = distance * Math.cos(this.elevation);
    return position.set(radius * Math.sin(this.angle), Math.max(.72, this.target.y + distance * Math.sin(this.elevation)), radius * Math.cos(this.angle));
  }

  beginInspection(): CameraPose {
    this.inspecting = true;
    this.canvas.dataset.inspecting = '';
    this.pointers.clear();
    this.panX = this.panY = this.zoomVelocity = 0;
    this.wake();
    return { position: this.camera.position.clone(), target: this.target.clone() };
  }

  setInspectionPose(pose: CameraPose): void {
    this.camera.position.copy(pose.position);
    this.camera.lookAt(pose.target);
    this.camera.updateMatrixWorld();
  }

  endInspection(): void {
    this.inspecting = false;
    delete this.canvas.dataset.inspecting;
    this.wake();
    this.applyPose();
  }

  private wake(): void {
    this.idle = 0;
    this.drift = 0;
    this.orbiting = false;
  }

  private onDown = (event: PointerEvent): void => {
    if (!this.enabled || this.inspecting || event.pointerType === 'mouse' && event.button !== 0 || this.pointers.size === 2) return;
    this.wake();
    this.panX = this.panY = this.zoomVelocity = 0;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.canvas.setPointerCapture(event.pointerId);
  };

  private onMove = (event: PointerEvent): void => {
    const previous = this.pointers.get(event.pointerId);
    if (!this.enabled || this.inspecting || !previous) return;
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
    if (!this.enabled || this.inspecting) return;
    this.wake();
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.canvas.clientHeight : 1;
    this.zoomVelocity = clamp(this.zoomVelocity + event.deltaY * scale * 0.00125, -0.26, 0.26);
  };
}
