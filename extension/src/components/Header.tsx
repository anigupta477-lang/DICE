import { DiceLogoIcon } from './Icons';

export function Header() {
  return (
    <header className="app-header">
      <div className="header-brand">
        <span className="brand-mark">
          <DiceLogoIcon />
        </span>
        <div className="brand-text">
          <h1 className="brand-title">DICE</h1>
          <p className="brand-subtitle">Your intelligent research companion</p>
        </div>
      </div>
      <span className="preview-badge" title="Phase 1 UI Preview">
        <span className="preview-dot" />
        UI Preview
      </span>
    </header>
  );
}
