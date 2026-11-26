import type { NavTab } from '../types';

interface TopNavigationProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

const TABS: Array<{ id: NavTab; label: string }> = [
  { id: 'research', label: 'Research' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'clips', label: 'Saved Clips' },
  { id: 'agents', label: 'Agents' },
];

export function TopNavigation({ activeTab, onSelectTab }: TopNavigationProps) {
  return (
    <nav className="top-nav" aria-label="DICE Navigation">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`nav-tab${isActive ? ' is-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelectTab(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
