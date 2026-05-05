import React from 'react';
import { Milestone } from '../types';

interface MilestoneBadgeProps {
    milestone: Milestone;
    type: 'reading' | 'memorization';
}

const MilestoneBadge: React.FC<MilestoneBadgeProps> = ({ milestone, type }) => {
    const colors = {
        reading: 'bg-teal-100 dark:bg-orange-900/50 text-teal-600 dark:text-orange-400 border-teal-200 dark:border-orange-800',
        memorization: 'bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-800'
    };

    return (
        <div className="relative group">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 ${colors[type]}`}>
                {typeof milestone.badgeIcon === 'string' ? (
                    <span className="font-bold text-xs">{milestone.badgeIcon}</span>
                ) : (
                    // FIX: Cast milestone.badgeIcon to a React.ReactElement that can accept a className prop.
                    // This is necessary because TypeScript cannot infer from the React.ReactNode type that
                    // the element can have a `className` prop added via `cloneElement`.
                    React.isValidElement(milestone.badgeIcon) && React.cloneElement(milestone.badgeIcon as React.ReactElement<{ className?: string }>, { className: "w-4 h-4" })
                )}
            </div>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs bg-slate-800 text-white text-xs rounded py-1 px-2 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20 whitespace-nowrap">
                {milestone.title}
                <div className="text-slate-300 text-[10px]">{milestone.description}</div>
                <svg className="absolute text-slate-800 h-2 w-full left-0 top-full" x="0px" y="0px" viewBox="0 0 255 255">
                    <polygon className="fill-current" points="0,0 127.5,127.5 255,0"/>
                </svg>
            </div>
        </div>
    );
};

export default MilestoneBadge;
