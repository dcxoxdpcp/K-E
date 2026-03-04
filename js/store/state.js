/**
 * js/store/state.js - Gestión del Estado y Persistencia
 */

export const DEFAULT_LABELS = {
    'Prioridad Alta': 'bg-red-200 text-red-800 dark:bg-red-700 dark:text-red-100',
    'Feature': 'bg-blue-200 text-blue-800 dark:bg-blue-700 dark:text-blue-100',
    'Bug': 'bg-yellow-200 text-yellow-800 dark:bg-yellow-700 dark:text-yellow-100',
    'Documentación': 'bg-green-200 text-green-800 dark:bg-green-700 dark:text-green-100',
    'Investigación': 'bg-purple-200 text-purple-800 dark:bg-purple-700 dark:text-purple-100',
};

export const DEFAULT_MEMBERS = [
    { id: 'm1', name: 'Ana Técnico', color: 'bg-indigo-500' },
    { id: 'm2', name: 'Beto Lead', color: 'bg-emerald-500' },
    { id: 'm3', name: 'Carla DevOps', color: 'bg-rose-500' },
    { id: 'm4', name: 'Dani Design', color: 'bg-amber-500' },
    { id: 'm5', name: 'Erik QA', color: 'bg-sky-500' },
    { id: 'm6', name: 'Fabi PM', color: 'bg-violet-500' },
    { id: 'm7', name: 'Gaby Backend', color: 'bg-fuchsia-500' },
    { id: 'm8', name: 'Hugo Frontend', color: 'bg-orange-500' },
    { id: 'm9', name: 'Iris Data', color: 'bg-teal-500' },
    { id: 'm10', name: 'Juan Security', color: 'bg-slate-700' }
];

export const DEFAULT_USERS = [
    { id: 'u_admin', name: 'Gerente Principal', role: 'admin', avatar: '👑', color: 'bg-yellow-500', password: 'admin123' },
    { id: 'u_member1', name: 'Ana Técnico', role: 'member', avatar: '👩‍💻', color: 'bg-indigo-500', linkedMemberId: 'm1', password: 'ana123' },
    { id: 'u_member2', name: 'Beto Lead', role: 'member', avatar: '👨‍💻', color: 'bg-emerald-500', linkedMemberId: 'm2', password: 'beto123' },
    { id: 'u_guest', name: 'Invitado', role: 'viewer', avatar: '👀', color: 'bg-gray-400', password: 'guest' }
];

export const AVATAR_OPTIONS = ['👑', '👩‍💻', '👨‍💻', '👀', '🧑‍🔬', '🧑‍🎨', '🧑‍🏫', '🧑‍⚕️', '🦸', '🦹', '🧙', '🧑‍🚀', '🤖', '👤', '🐱', '🦊'];

export const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        try {
            return crypto.randomUUID();
        } catch (e) { }
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

// Estado Inicial
export const state = {
    boards: [],
    matrices: [],
    members: [...DEFAULT_MEMBERS],
    settings: { theme: 'ocean', lastView: 'boards' },
    currentBoardId: null,
    currentMatrixId: null,
    users: [...DEFAULT_USERS],
    currentUser: null,
    activityLog: [],
    _lastSyncTimestamp: Date.now(),
    cloudConfig: { url: '', key: '', enabled: false }
};

const SAVE_KEY = 'kanbanAppState_v2';

export const StorageProvider = {
    save(data) {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error("StorageProvider Error:", e);
            return false;
        }
    },
    load() {
        try {
            const saved = localStorage.getItem(SAVE_KEY);
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            console.error("StorageProvider Load Error:", e);
            return null;
        }
    }
};

export const ActivityLogger = {
    log(action, target, details) {
        const entry = {
            id: generateUUID(),
            timestamp: new Date().toISOString(),
            userId: state.currentUser?.id || 'unknown',
            userName: state.currentUser?.name || 'Desconocido',
            action,
            target,
            details
        };
        state.activityLog.unshift(entry);
        if (state.activityLog.length > 100) state.activityLog.pop();
        // saveState() se llamará desde fuera para evitar dependencias circulares complejas
    }
};
