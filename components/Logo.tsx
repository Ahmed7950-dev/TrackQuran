import React, { useState, useEffect } from 'react';

const Logo: React.FC = () => {
    const [isDarkMode, setIsDarkMode] = useState(() => {
        if (typeof document !== 'undefined') {
            return document.documentElement.classList.contains('dark');
        }
        return false;
    });

    useEffect(() => {
        const checkDarkMode = () => {
            setIsDarkMode(document.documentElement.classList.contains('dark'));
        };

        // Check initially
        checkDarkMode();

        // Watch for changes to the dark class
        const observer = new MutationObserver(checkDarkMode);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class']
        });

        return () => observer.disconnect();
    }, []);

    return (
        <img 
            src={isDarkMode ? "/TQ LOGO DM.png" : "/TQ LOGO.png"} 
            alt="TQ Logo" 
            style={{ height: '85px', width: 'auto' }}
            className="object-contain"
        />
    );
};

export default Logo;