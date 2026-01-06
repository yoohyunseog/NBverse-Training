// Global variables initialization
// These variables are used across multiple modules

// Data collection state
window.isCollecting = false;
window.isCalculating = false;
window.isFetchingBitMax = false;
window.isGeneratingCard = false;

// Card state
window.autoCardScheduled = false;
window.tradingCardsGenerated = false;

// Data storage
window.collectedData = null;
window.lastNBResult = null;
window.lastCardResponse = null;
window.latestPredictionCard = null;
window.tradingCards = [];
window.ownedCards = [];

// UI state
window.selectedTimeframeValue = '1m';
window.flowTimers = {};
window.isAutoLooping = false;
window.autoLoopTimer = null;

// API configuration
window.API_BASE = 'http://localhost:5000';

// Timeframe order for navigation
window.timeframeOrder = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d'];

// Note: Use window.variableName to access these globally in all modules
// Example: window.collectedData, window.selectedTimeframeValue, etc.
const timeframeOrder = window.timeframeOrder;

console.log('✅ Global variables initialized');
