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

    const variants = {
        primary: "bg-party-secondary text-slate-900 hover:bg-yellow-400 font-bold",
        secondary: "bg-party-surface text-white border border-white/5 hover:bg-slate-600",
        ghost: "bg-transparent hover:bg-white/5 text-slate-400 hover:text-white",
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
        className={`bg-party-surface rounded-xl p-6 shadow-lg border border-white/5 ${props.onClick ? 'cursor-pointer hover:bg-slate-600/80 transition-all duration-200 hover:-translate-y-1' : ''} ${className}`}
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
                <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors text-gray-300">
                    <ChevronLeft className="w-6 h-6" />
                </button>
            )}
            <h1 className="text-2xl font-bold text-white font-serif tracking-wide">
                {title}
            </h1>
        </div>
        {onHome && (
            <button onClick={onHome} className="p-2 -mr-2 rounded-full hover:bg-white/10 transition-colors text-gray-400 hover:text-white" aria-label="Home">
                <Home className="w-5 h-5" />
            </button>
        )}
    </div>
);
