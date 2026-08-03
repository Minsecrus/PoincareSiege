import {
  getBaseHealthSegments,
  type BaseProgression,
} from '../game/baseProgression';
import {
  canStartNextWave,
  hasWon,
  type WaveState,
} from '../game/waveState';
import type { PlayerResources } from '../game/playerResources';
import type { GameSpeedState } from '../game/gameSpeed';

type GameResult = 'victory' | 'defeat' | null;

interface GameHudActions {
  startWave: () => void;
  cycleSpeed: () => void;
  togglePause: () => void;
  resumeFromPauseMenu: () => void;
  restart: () => void;
  nextLevel: () => void;
  returnHome: () => void;
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing game HUD element: ${selector}`);
  }
  return element;
}

function renderHealthPips(
  element: HTMLElement,
  totalPips: number,
  filledPips: number,
): void {
  if (element.childElementCount !== totalPips) {
    element.replaceChildren(
      ...Array.from({ length: totalPips }, () => document.createElement('i')),
    );
  }
  element.querySelectorAll('i').forEach((pip, index) => {
    pip.classList.toggle('is-active', index < filledPips);
  });
}

export class GameHud {
  private readonly baseHealth =
    requireElement<HTMLElement>('#hud-base-health');
  private readonly waveCurrent =
    requireElement<HTMLElement>('#hud-wave-current');
  private readonly waveTotal = requireElement<HTMLElement>('#hud-wave-total');
  private readonly enemyCount = requireElement<HTMLElement>('#hud-enemy-count');
  private readonly waveCountdown =
    requireElement<HTMLElement>('#hud-wave-countdown');
  private readonly waveCountdownValue =
    requireElement<HTMLElement>('#hud-wave-countdown-value');
  private readonly startWaveButton =
    requireElement<HTMLButtonElement>('#start-wave');
  private readonly speedButton =
    requireElement<HTMLButtonElement>('#game-speed');
  private readonly speedValue =
    requireElement<HTMLElement>('#game-speed-value');
  private readonly resourceValue =
    requireElement<HTMLElement>('#hud-resource-value');
  private readonly pauseButton =
    requireElement<HTMLButtonElement>('#pause-game');
  private readonly pauseOverlay =
    requireElement<HTMLDivElement>('#game-pause-overlay');
  private readonly resumeButton =
    requireElement<HTMLButtonElement>('#resume-game');
  private readonly pauseRestartButton =
    requireElement<HTMLButtonElement>('#pause-restart-game');
  private readonly returnHomeButton =
    requireElement<HTMLButtonElement>('#return-home');
  private readonly resultOverlay =
    requireElement<HTMLDivElement>('#game-result-overlay');
  private readonly resultCard =
    requireElement<HTMLDivElement>('#game-result-card');
  private readonly restartButton =
    requireElement<HTMLButtonElement>('#restart-game');
  private readonly nextLevelButton =
    requireElement<HTMLButtonElement>('#next-level');
  private readonly resultReturnHomeButton =
    requireElement<HTMLButtonElement>('#result-return-home');
  private readonly hoverBuildCost =
    requireElement<HTMLDivElement>('#hover-build-cost');
  private readonly hoverBuildCostValue =
    requireElement<HTMLElement>('#hover-build-cost-value');
  private readonly actions: GameHudActions;

  constructor(actions: GameHudActions) {
    this.actions = actions;
    this.startWaveButton.addEventListener('click', this.onStartWave);
    this.speedButton.addEventListener('click', this.onCycleSpeed);
    this.pauseButton.addEventListener('click', this.onTogglePause);
    this.resumeButton.addEventListener('click', this.onResumeFromPauseMenu);
    this.pauseRestartButton.addEventListener('click', this.onRestart);
    this.returnHomeButton.addEventListener('click', this.onReturnHome);
    this.restartButton.addEventListener('click', this.onRestart);
    this.nextLevelButton.addEventListener('click', this.onNextLevel);
    this.resultReturnHomeButton.addEventListener('click', this.onReturnHome);
  }

  updateBase(progression: BaseProgression): void {
    const health = getBaseHealthSegments(progression);
    renderHealthPips(
      this.baseHealth,
      health.totalSegments,
      health.filledSegments,
    );
    this.baseHealth.setAttribute('aria-label', '基地生命');
  }

  updateResources(resources: PlayerResources): void {
    this.resourceValue.textContent = String(resources.amount);
  }

  updateSpeed(speed: GameSpeedState): void {
    this.speedValue.textContent = `${speed.multiplier}×`;
    this.speedButton.setAttribute(
      'aria-label',
      `当前 ${speed.multiplier} 倍速，点击切换倍速`,
    );
  }

  updateWave(state: WaveState, countdownSeconds: number | null = null): void {
    const displayedWave =
      state.currentWave === 0 && !hasWon(state)
        ? 1
        : Math.max(1, state.currentWave);
    const unsentEnemies = state.plannedEnemies - state.spawnedEnemies;
    this.waveCurrent.textContent = String(displayedWave);
    this.waveTotal.textContent = String(state.totalWaves);
    this.enemyCount.textContent = String(
      Math.max(0, state.remainingEnemies + unsentEnemies),
    );
    const showCountdown =
      (state.phase === 'pending' || state.phase === 'complete') &&
      countdownSeconds !== null &&
      Number.isFinite(countdownSeconds);
    this.waveCountdown.hidden = !showCountdown;
    if (showCountdown) {
      const displayedCountdown = Math.max(0, Math.ceil(countdownSeconds));
      this.waveCountdownValue.textContent = String(displayedCountdown);
      this.waveCountdown.setAttribute(
        'aria-label',
        `下一波倒计时 ${displayedCountdown} 秒`,
      );
    }
    this.startWaveButton.disabled = !canStartNextWave(state);
    this.startWaveButton.setAttribute(
      'aria-label',
      canStartNextWave(state) ? '提前开始下一波' : '下一波不可开始',
    );
    this.pauseButton.disabled = hasWon(state);
    this.pauseButton.classList.toggle('is-paused', state.paused);
    this.pauseButton.setAttribute(
      'aria-label',
      state.paused ? '继续游戏' : '暂停游戏',
    );
  }

  setResult(result: GameResult, canStartNextLevel = false): void {
    this.resultOverlay.hidden = result === null;
    if (result !== null) {
      this.resultCard.dataset.result = result;
    }
    this.nextLevelButton.hidden =
      result !== 'victory' || !canStartNextLevel;
  }

  setPauseMenu(open: boolean): void {
    this.pauseOverlay.hidden = !open;
    if (open) {
      this.resumeButton.focus({ preventScroll: true });
    }
  }

  setHoverBuildCost(
    cost: number | null,
    screenX = 0,
    screenY = 0,
  ): void {
    this.hoverBuildCost.hidden = cost === null;
    if (cost === null) {
      return;
    }
    this.hoverBuildCostValue.textContent = String(cost);
    this.hoverBuildCost.style.left = `${screenX}px`;
    this.hoverBuildCost.style.top = `${screenY}px`;
  }

  dispose(): void {
    this.startWaveButton.removeEventListener('click', this.onStartWave);
    this.speedButton.removeEventListener('click', this.onCycleSpeed);
    this.pauseButton.removeEventListener('click', this.onTogglePause);
    this.resumeButton.removeEventListener('click', this.onResumeFromPauseMenu);
    this.pauseRestartButton.removeEventListener('click', this.onRestart);
    this.returnHomeButton.removeEventListener('click', this.onReturnHome);
    this.restartButton.removeEventListener('click', this.onRestart);
    this.nextLevelButton.removeEventListener('click', this.onNextLevel);
    this.resultReturnHomeButton.removeEventListener('click', this.onReturnHome);
  }

  private readonly onStartWave = (): void => {
    this.actions.startWave();
  };

  private readonly onCycleSpeed = (): void => {
    this.actions.cycleSpeed();
  };

  private readonly onTogglePause = (): void => {
    this.actions.togglePause();
  };

  private readonly onResumeFromPauseMenu = (): void => {
    this.actions.resumeFromPauseMenu();
  };

  private readonly onRestart = (): void => {
    this.actions.restart();
  };

  private readonly onNextLevel = (): void => {
    this.actions.nextLevel();
  };

  private readonly onReturnHome = (): void => {
    this.actions.returnHome();
  };

}
