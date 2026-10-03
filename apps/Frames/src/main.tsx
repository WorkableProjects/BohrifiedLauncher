import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import { bohr } from './bohr';
import { Root } from './Root';
import { applyAppearance, applyUiPrefs, prefs, watchPrefs } from './state/prefs';
import { AudienceApp, PresenterApp } from './present/windows';

applyAppearance();
applyUiPrefs();
prefs.subscribe(() => applyUiPrefs());
watchPrefs();

const view = new URLSearchParams(location.search).get('view');

createRoot(document.getElementById('root')!).render(
  <StrictMode>{view === 'audience' ? <AudienceApp /> : view === 'presenter' ? <PresenterApp /> : <Root />}</StrictMode>,
);

void bohr;
