import React from 'react';

export function LoadingScreen({ startupStatus }) {
    const progress = Math.max(0, Math.min(100, Number(startupStatus?.progress ?? 0)));
    const stageText = startupStatus?.stageText || "מכייל רשתות נוירונים...";
    const detailText = startupStatus?.detailText || "";
    const frameCount = startupStatus?.frameCount ?? 0;
    const isStuck = Boolean(startupStatus?.isStuck);

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
                <p className={`text-sm sm:text-base ${isStuck ? "text-red-300" : "text-neon-blue"} opacity-90`}>
                    {stageText}
                </p>
                <p className={`text-xs sm:text-sm mt-1 ${isStuck ? "text-red-200" : "text-neon-blue"} opacity-80`}>
                    {detailText}
                </p>
                {frameCount > 0 && (
                    <p className="text-xs mt-2 text-neon-green opacity-70">
                        פריימים: {frameCount}
                    </p>
                )}
                <div className="w-full h-2 mt-4 bg-deep-space bg-opacity-60 rounded-full overflow-hidden">
                    <div
                        className={`h-full ${isStuck ? "bg-red-300" : "bg-neon-blue"} transition-all duration-300`}
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>
        </div>
    )
}
