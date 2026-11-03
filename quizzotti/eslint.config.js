'use strict';
/* Configurazione ESLint (flat config) per motore condiviso, script dei
   giochi, script di manutenzione e test. I database (assets/db-*.js)
   dichiarano variabili globali lette dagli script dei giochi: per questo
   sono elencati come globali qui sotto. */
const browser = {
    window: 'readonly',
    document: 'readonly',
    navigator: 'readonly',
    location: 'readonly',
    console: 'readonly',
    performance: 'readonly',
    requestAnimationFrame: 'readonly',
    cancelAnimationFrame: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    CustomEvent: 'readonly',
    Event: 'readonly',
    AudioContext: 'readonly',
    webkitAudioContext: 'readonly',
    SpeechRecognition: 'readonly',
    webkitSpeechRecognition: 'readonly',
    getComputedStyle: 'readonly',
    matchMedia: 'readonly',
    confirm: 'readonly',
    localStorage: 'readonly'
};
const data = {
    QZ: 'writable',
    QuizEngine: 'writable',
    QUIZ_DB: 'readonly',
    questions: 'readonly',
    fullDatabase: 'readonly',
    topics: 'readonly',
    quotes: 'readonly',
    playersDatabase: 'readonly',
    words: 'readonly',
    jeopardyData: 'readonly',
    wordsList: 'readonly',
    playerImages: 'readonly',
    tabooWords: 'readonly',
    database: 'readonly'
};
const node = {
    module: 'writable',
    require: 'readonly',
    global: 'writable',
    __dirname: 'readonly',
    process: 'readonly'
};

module.exports = [
    {
        files: ['assets/*.js', 'assets/games/*.js', 'scripts/*.js', 'tests/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: Object.assign({}, browser, data, node)
        },
        rules: {
            'no-unused-vars': 'warn',
            'no-undef': 'error',
            eqeqeq: ['warn', 'smart'],
            'no-var': 'off'
        }
    },
    {
        // i database dichiarano le proprie variabili globali: non sono "ridichiarazioni"
        files: ['assets/db-*.js', 'assets/questions-data.js'],
        rules: { 'no-redeclare': 'off' }
    }
];
