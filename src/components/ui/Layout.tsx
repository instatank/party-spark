import React from 'react';
import { ChevronLeft, Home } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    variant = 'primary',
    fullWidth = false,
    className = '',
    ...props
}) => {
    const baseStyles = "py-3 px-6 rounded-lg font-medium transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed tracking-wide shadow-sm";

    // Primary uses gold + dark-on-gold text. The fixed slate-900 reads on
    // both gold variants (#EFC050 dark / #B8922F light) at AA contrast.
    // Secondary, ghost, danger all route through semantic tokens so they
    // flip cleanly with the theme.
    const variants = {
        primary: "bg-gold text-slate-900 hover:brightness-110 font-bold",
        secondary: "bg-surface text-ink border border-divider-soft hover:bg-surface-alt",
        ghost: "bg-transparent hover:bg-surface-alt text-muted hover:text-ink",
        danger: "bg-red-500 hover:bg-red-600 text-white"
    };
    return (
        <button
            className={`${baseStyles} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
};

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(({ children, className = '', ...props }, ref) => (
    <div
        ref={ref}
        className={`bg-surface rounded-xl p-6 border border-divider-soft ${props.onClick ? 'cursor-pointer hover:bg-surface-alt transition-all duration-200 hover:-translate-y-1' : ''} ${className}`}
        style={{ boxShadow: 'var(--shadow-card)', ...((props as any).style || {}) }}
        {...props}
    >
        {children}
    </div>
));
Card.displayName = 'Card';

export const ScreenHeader: React.FC<{ title: string, onBack?: () => void, onHome?: () => void }> = ({ title, onBack, onHome }) => (
    <div className="flex items-center justify-between mb-6 pt-4">
        <div className="flex items-center gap-2">
            {onBack && (
                <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-surface-alt transition-colors text-ink-soft">
                    <ChevronLeft className="w-6 h-6" />
                </button>
            )}
            <h1 className="text-2xl font-bold text-ink font-serif tracking-wide">
                {title}
            </h1>
        </div>
        {onHome && (
            <button
                onClick={onHome}
                className="p-2.5 rounded-xl bg-surface-alt border border-divider hover:bg-app-tint hover:border-gold/50 transition-all duration-300 text-ink-soft hover:text-gold shadow-sm overflow-hidden group"
                aria-label="Home"
            >
                <Home className="w-6 h-6 group-hover:scale-110 transition-transform duration-300" strokeWidth={2.25} />
            </button>
        )}
    </div>
);
