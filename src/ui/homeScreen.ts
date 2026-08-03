import './homeScreen.css';
import {
  isCampaignLevelCompleted,
  isCampaignLevelUnlocked,
  type CampaignLevelId,
  type CampaignProgress,
} from '../game/campaignProgress';

export type { CampaignLevelId } from '../game/campaignProgress';

export interface HomeScreenOptions {
  readonly onStartLevel: (levelId: CampaignLevelId) => void;
  readonly progress: CampaignProgress;
}

interface HomeLevel {
  readonly id: CampaignLevelId;
  readonly numeral: string;
  readonly position: readonly [number, number];
  readonly rotation: number;
}

const LEVELS: readonly HomeLevel[] = [
  {
    id: 'level-1',
    numeral: 'I',
    position: [50, 52],
    rotation: 0,
  },
  {
    id: 'level-2',
    numeral: 'II',
    position: [57, 44],
    rotation: 35,
  },
  {
    id: 'level-3',
    numeral: 'III',
    position: [66, 40],
    rotation: 70,
  },
  {
    id: 'level-4',
    numeral: 'IV',
    position: [75, 45],
    rotation: 105,
  },
  {
    id: 'level-5',
    numeral: 'V',
    position: [81, 54],
    rotation: 140,
  },
  {
    id: 'level-6',
    numeral: 'VI',
    position: [80, 64],
    rotation: 175,
  },
  {
    id: 'level-7',
    numeral: 'VII',
    position: [72, 73],
    rotation: 210,
  },
];

function pointOnCircle(radius: number, angle: number): readonly [number, number] {
  return [
    500 + Math.cos(angle) * radius,
    500 + Math.sin(angle) * radius,
  ];
}

function pointString(point: readonly [number, number]): string {
  return `${point[0].toFixed(1)} ${point[1].toFixed(1)}`;
}

/**
 * Decorative Poincare-disk drawing: seven curvilinear triangles meet at the
 * centre, while increasingly compressed rings suggest a {3,7} tessellation.
 * The level path itself follows a visibly curved, boundary-facing spiral.
 */
function createHyperbolicDiskMarkup(): string {
  const centralTriangles = Array.from({ length: 7 }, (_, index) => {
    const startAngle = -Math.PI / 2 + (index / 7) * Math.PI * 2;
    const endAngle = -Math.PI / 2 + ((index + 1) / 7) * Math.PI * 2;
    const start = pointOnCircle(132, startAngle);
    const end = pointOnCircle(132, endAngle);
    const arc = pointOnCircle(168, (startAngle + endAngle) / 2);
    return `<path class="home-disk__central-triangle" d="M 500 500 L ${pointString(start)} Q ${pointString(arc)} ${pointString(end)} Z" />`;
  }).join('');

  const outerTriangles = [206, 286, 356, 414].map((radius, ring) => {
    const count = 7 * (ring + 2);
    return Array.from({ length: count }, (_, index) => {
      const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
      const nextAngle = -Math.PI / 2 + ((index + 1) / count) * Math.PI * 2;
      const innerRadius = radius - 58 + ring * 5;
      const a = pointOnCircle(innerRadius, angle);
      const b = pointOnCircle(radius, angle + (nextAngle - angle) * 0.48);
      const c = pointOnCircle(innerRadius, nextAngle);
      return `<path class="home-disk__outer-triangle home-disk__outer-triangle--${ring}" d="M ${pointString(a)} L ${pointString(b)} L ${pointString(c)} Z" />`;
    }).join('');
  }).join('');

  const radialGuides = Array.from({ length: 7 }, (_, index) => {
    const angle = -Math.PI / 2 + (index / 7) * Math.PI * 2;
    const outer = pointOnCircle(448, angle);
    return `<path class="home-disk__guide" d="M 500 500 L ${pointString(outer)}" />`;
  }).join('');

  return `
    <svg class="home-disk" viewBox="0 0 1000 1000" aria-hidden="true">
      <defs>
        <radialGradient id="homeDiskFill" cx="50%" cy="50%" r="60%">
          <stop offset="0" stop-color="#153d42" stop-opacity="0.76" />
          <stop offset="0.55" stop-color="#0c2631" stop-opacity="0.52" />
          <stop offset="1" stop-color="#050d1a" stop-opacity="0.08" />
        </radialGradient>
        <radialGradient id="homeDiskCore" cx="50%" cy="50%" r="58%">
          <stop offset="0" stop-color="#9dfff1" stop-opacity="0.82" />
          <stop offset="0.17" stop-color="#55d9ca" stop-opacity="0.25" />
          <stop offset="1" stop-color="#55d9ca" stop-opacity="0" />
        </radialGradient>
        <filter id="homeDiskGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <clipPath id="homeDiskClip"><circle cx="500" cy="500" r="454" /></clipPath>
      </defs>
      <circle class="home-disk__halo" cx="500" cy="500" r="472" />
      <circle class="home-disk__edge" cx="500" cy="500" r="454" />
      <g clip-path="url(#homeDiskClip)">
        <circle class="home-disk__fill" cx="500" cy="500" r="454" />
        <g class="home-disk__tiling">${radialGuides}${centralTriangles}${outerTriangles}</g>
        <circle class="home-disk__radius home-disk__radius--one" cx="500" cy="500" r="132" />
        <circle class="home-disk__radius home-disk__radius--two" cx="500" cy="500" r="286" />
        <circle class="home-disk__radius home-disk__radius--three" cx="500" cy="500" r="414" />
        <path class="home-disk__spiral" d="M 500 520 C 538 480, 576 432, 642 404 S 756 424, 786 500 S 802 640, 720 730" />
        <circle class="home-disk__core" cx="500" cy="500" r="108" />
      </g>
      <circle class="home-disk__rim" cx="500" cy="500" r="454" />
    </svg>`;
}

function createLevelMarkup(
  level: HomeLevel,
  progress: CampaignProgress,
): string {
  const unlocked = isCampaignLevelUnlocked(progress, level.id);
  const completed = isCampaignLevelCompleted(progress, level.id);
  const stateClass = completed
    ? 'is-completed'
    : unlocked
      ? 'is-unlocked'
      : 'is-locked';
  const disabled = unlocked ? '' : ' disabled';
  const ariaLabel = completed
    ? `${level.numeral}，已完成，可重玩`
    : unlocked
      ? `${level.numeral}，开始`
      : `${level.numeral}，尚未解锁`;
  const detail = completed ? '✓' : unlocked ? '•' : '◇';
  return `
    <button
      class="home-level ${stateClass}"
      type="button"
      data-home-level="${level.id}"
      aria-label="${ariaLabel}"
      style="--level-x: ${level.position[0]}%; --level-y: ${level.position[1]}%; --level-rotation: ${level.rotation}deg;"
      ${disabled}
    >
      <span class="home-level__cell" aria-hidden="true"><span>${level.numeral}</span></span>
      <span class="home-level__detail" aria-hidden="true">${detail}</span>
    </button>`;
}

/** A DOM-owned title screen that starts the Three.js battlefield only on demand. */
export class HomeScreen {
  private readonly host: HTMLElement;
  private readonly options: HomeScreenOptions;
  private readonly root: HTMLElement;
  private readonly levels: HTMLElement;
  private progress: CampaignProgress;
  private entryTimer = 0;
  private isLaunching = false;

  constructor(host: HTMLElement, options: HomeScreenOptions) {
    this.host = host;
    this.options = options;
    this.progress = options.progress;
    this.root = document.createElement('section');
    this.root.className = 'home-screen';
    this.root.setAttribute('aria-label', 'Poincaré Siege 主页');
    this.root.innerHTML = `
      <div class="home-screen__sky" aria-hidden="true"></div>
      <div class="home-screen__disk-wrap">${createHyperbolicDiskMarkup()}</div>
      <header class="home-screen__brand">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="m24 3 17 10v22L24 45 7 35V13L24 3Zm0 8-10 6v14l10 6 10-6V17l-10-6Z" />
          <path d="m24 15 8 5v9l-8 5-8-5v-9l8-5Z" />
        </svg>
        <div><strong>POINCARÉ</strong><span>SIEGE</span></div>
      </header>
      <div class="home-screen__copy">
        <p>守住圆心</p>
        <button class="home-screen__launch" type="button" data-home-start aria-label="进入第一关">
          <svg viewBox="0 0 48 48" aria-hidden="true"><path d="m16 10 20 14-20 14V10Z" /></svg>
          <span>战役</span>
        </button>
      </div>
      <nav class="home-screen__levels" aria-label="关卡选择">
        ${LEVELS.map((level) => createLevelMarkup(level, this.progress)).join('')}
      </nav>
      <button class="home-screen__motion" type="button" data-home-motion aria-pressed="false" aria-label="切换主页动效">
        <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4a20 20 0 1 0 20 20A20 20 0 0 0 24 4Zm0 6a14 14 0 1 1-14 14A14 14 0 0 1 24 10Zm-3 5v18l13-9-13-9Z" /></svg>
      </button>
    `;
    this.host.replaceChildren(this.root);
    this.levels = this.root.querySelector<HTMLElement>('.home-screen__levels')
      ?? (() => {
        throw new Error('Missing home level navigation.');
      })();
    this.root
      .querySelector<HTMLButtonElement>('[data-home-start]')
      ?.addEventListener('click', this.onStart);
    this.levels.addEventListener('click', this.onLevel);
    this.root
      .querySelector<HTMLButtonElement>('[data-home-motion]')
      ?.addEventListener('click', this.onToggleMotion);
  }

  show(): void {
    window.clearTimeout(this.entryTimer);
    this.isLaunching = false;
    this.root.hidden = false;
    this.root.classList.remove('is-entering');
  }

  hide(): void {
    window.clearTimeout(this.entryTimer);
    this.root.hidden = true;
  }

  setProgress(progress: CampaignProgress): void {
    this.progress = progress;
    this.levels.innerHTML = LEVELS.map((level) =>
      createLevelMarkup(level, this.progress),
    ).join('');
  }

  dispose(): void {
    window.clearTimeout(this.entryTimer);
    this.levels.removeEventListener('click', this.onLevel);
    this.root.remove();
  }

  private readonly onStart = (): void => {
    this.launch('level-1');
  };

  private readonly onLevel = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>('[data-home-level]');
    if (!button || !this.levels.contains(button)) {
      return;
    }
    const levelId = button.dataset.homeLevel as CampaignLevelId | undefined;
    if (!levelId || button.disabled) {
      return;
    }
    this.launch(levelId);
  };

  private readonly onToggleMotion = (event: Event): void => {
    const button = event.currentTarget as HTMLButtonElement;
    const reducedMotion = this.root.classList.toggle('is-motion-reduced');
    button.setAttribute('aria-pressed', String(reducedMotion));
  };

  private launch(levelId: CampaignLevelId): void {
    if (this.isLaunching) {
      return;
    }
    this.isLaunching = true;
    this.root.classList.add('is-entering');
    this.entryTimer = window.setTimeout(() => {
      this.options.onStartLevel(levelId);
      this.root.hidden = true;
    }, 360);
  }
}
