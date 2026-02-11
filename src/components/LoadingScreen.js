import React from 'react';

export function LoadingScreen() {
    return (
        <div className="loading-screen fixed inset-0 bg-deep-space bg-opacity-95 flex items-center justify-center z-50 backdrop-filter backdrop-blur-lg">
            <div className="text-center p-8 rounded-3xl bg-space-gray bg-opacity-20 backdrop-filter backdrop-blur-md shadow-neon-soft max-w-sm w-full mx-4">
                <div className="relative w-24 h-24 mb-6 mx-auto">
                    <div className="absolute inset-0 border-4 border-neon-blue rounded-full animate-spin-slow opacity-75"></div>
                    <div className="absolute inset-3 border-4 border-neon-blue rounded-full animate-spin-reverse-slow opacity-50"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-neon-blue text-2xl font-bold animate-pulse">AI</div>
                    </div>
                </div>
                <p className="text-neon-blue text-xl sm:text-2xl font-light mb-4 animate-pulse-slow glow-neon">
                    מאתחל את ergoSmart AI
                </p>
                <p className="text-neon-blue text-sm sm:text-base animate-pulse opacity-75">
                    מכייל רשתות נוירונים...
                </p>
            </div>
        </div>
    )
}
