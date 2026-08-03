import './style.css';
import { PoincareScene } from './scene/PoincareScene';

const sceneContainer = document.querySelector<HTMLElement>('#scene');

if (!sceneContainer) {
  throw new Error('Missing #scene container.');
}

const poincareScene = new PoincareScene(sceneContainer);

if (import.meta.hot) {
  import.meta.hot.dispose(() => poincareScene.dispose());
}
