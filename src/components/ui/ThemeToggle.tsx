import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';

export const ThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
    const { theme, toggle } = useTheme();
    const isLight = theme === 'light';
    return (
        <button
            onClick={toggle}
            aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
            className={`p-2 rounded-full bg-surface-alt hover:bg-app-tint border border-divider-soft text-ink-soft hover:text-ink transition-colors ${className}`}
        >
            {isLight ? <Moon size={16} /> : <Sun size={16} />}
        </button>
    );
};
