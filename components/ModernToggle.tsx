import React from 'react';

const ModernToggle: React.FC<{
    value: 'reading' | 'memorization';
    onChange: (value: 'reading' | 'memorization') => void;
    labelOne: string;
    labelTwo: string;
    orientation?: 'horizontal' | 'vertical';
}> = ({ value, onChange, labelOne, labelTwo, orientation = 'horizontal' }) => {
    const isHorizontal = orientation === 'horizontal';

    const containerClasses = isHorizontal
        ? 'w-20 h-10 flex-row'
        : 'w-10 h-20 flex-col';
    
    const movingPartTransform = isHorizontal
        ? (value === 'reading' ? 'translate-x-0' : 'translate-x-10')
        : (value === 'reading' ? 'translate-y-0' : 'translate-y-10');

    return (
        <div className={`relative flex items-center rounded-full bg-slate-200 dark:bg-gray-700 p-1 transition-colors duration-300 ${containerClasses}`}>
            {/* The moving part */}
            <span className={`absolute left-1 w-8 h-8 rounded-full bg-white dark:bg-gray-800 shadow-md transform transition-transform duration-300 ease-in-out ${movingPartTransform}`}/>
            
            {/* Button 1: Reading */}
            <button
                onClick={() => onChange('reading')}
                title={labelOne}
                aria-label={labelOne}
                className={`relative z-10 w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-300 ${value === 'reading' ? 'text-teal-600 dark:text-orange-500' : 'text-slate-500 dark:text-slate-400'}`}
            >
                {/* Book Icon */}
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                </svg>
            </button>

            {/* Button 2: Memorization */}
            <button
                onClick={() => onChange('memorization')}
                title={labelTwo}
                aria-label={labelTwo}
                className={`relative z-10 w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-300 ${value === 'memorization' ? 'text-teal-600 dark:text-orange-500' : 'text-slate-500 dark:text-slate-400'}`}
            >
                {/* Bookmark Icon */}
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
            </button>
        </div>
    );
};

export default ModernToggle;
