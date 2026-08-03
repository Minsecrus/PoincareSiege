import './style.css';
import { PoincareScene } from './scene/PoincareScene';
import { HomeScreen } from './ui/homeScreen';
import {
  completeCampaignLevelInStorage,
  isCampaignLevelId,
  isCampaignLevelUnlocked,
  loadCampaignProgress,
  type CampaignLevelId,
  type CampaignProgress,
} from './game/campaignProgress';

const app = document.querySelector<HTMLElement>('#app');
const homeHost = document.querySelector<HTMLElement>('#home-screen');
const gameShell = document.querySelector<HTMLElement>('#game-shell');
const sceneContainer = document.querySelector<HTMLElement>('#scene');

if (!app || !homeHost || !gameShell || !sceneContainer) {
  throw new Error('Missing Poincaré Siege application container.');
}

const battleShell = gameShell;
const battleSceneContainer = sceneContainer;
let poincareScene: PoincareScene | null = null;
let campaignProgress: CampaignProgress = loadCampaignProgress();

function isPlayableLevel(value: string): value is CampaignLevelId {
  return (
    isCampaignLevelId(value) &&
    isCampaignLevelUnlocked(campaignProgress, value)
  );
}

function beginLevel(levelId: CampaignLevelId): void {
  if (!isPlayableLevel(levelId)) {
    return;
  }
  window.history.replaceState(null, '', `#${levelId}`);
  battleShell.hidden = false;
  if (poincareScene === null) {
    poincareScene = new PoincareScene(battleSceneContainer, {
      levelId,
      onReturnHome: returnToHome,
      onCompleteLevel: (completedLevelId) => {
        campaignProgress = completeCampaignLevelInStorage(completedLevelId);
        homeScreen.setProgress(campaignProgress);
      },
      onStartLevel: transitionToLevel,
    });
  }
}

function transitionToLevel(levelId: CampaignLevelId): void {
  if (!isPlayableLevel(levelId)) {
    return;
  }
  const activeScene = poincareScene;
  poincareScene = null;
  activeScene?.dispose();
  beginLevel(levelId);
}

const homeScreen = new HomeScreen(homeHost, {
  onStartLevel: beginLevel,
  progress: campaignProgress,
});

function returnToHome(): void {
  const activeScene = poincareScene;
  poincareScene = null;
  activeScene?.dispose();
  battleShell.hidden = true;
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}`,
  );
  campaignProgress = loadCampaignProgress();
  homeScreen.setProgress(campaignProgress);
  homeScreen.show();
}

const requestedLevel = window.location.hash.slice(1);
if (isPlayableLevel(requestedLevel)) {
  homeScreen.hide();
  beginLevel(requestedLevel);
} else {
  homeScreen.show();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    homeScreen.dispose();
    poincareScene?.dispose();
  });
}
