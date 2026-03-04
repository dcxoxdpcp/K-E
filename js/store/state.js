/**
 * js/store/state.js - Estado Global y Persistencia v3.1
 * ARCHIVO PRINCIPAL: No modificar directamente, usar StateManager
 */

export function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export const DEFAULT_LABELS = {
    'Prioridad Alta': 'bg-red-200 text-red-800',
    'Feature': 'bg-blue-200 text-blue-800',
    'Bug': 'bg-yellow-200 text-yellow-800',
    'Documentación': 'bg-green-200 text-green-800',
    'Investigación': 'bg-purple-200 text-purple-800'
};

const INITIAL_STATE = {
    boards: [],
    matrices: [],
    members: [
        { id: 'm1', name: 'Ana Técnico', color: 'bg-indigo-500' },
        { id: 'm2', name: 'Beto Lead', color: 'bg-emerald-500' },
        { id: 'm3', name: 'Carla DevOps', color: 'bg-rose-500' },
        { id: 'm4', name: 'Dani Design', color: 'bg-amber-500' },
        { id: 'm5', name: 'Erik QA', color: 'bg-sky-500' }
    ],
    users: [
        { id: 'u_admin', name: 'Gerente Principal', role: 'admin', avatar: '👑', color: 'bg-yellow-500', password: 'admin123' },
        { id: 'u_member1', name: 'Ana Técnico', role: 'member', avatar: '👩‍💻', color: 'bg-indigo-500', linkedMemberId: 'm1', password: 'ana123' },
        { id: 'u_member2', name: 'Beto Lead', role: 'member', avatar: '👨‍💻', color: 'bg-emerald-500', linkedMemberId: 'm2', password: 'beto123' },
        { id: 'u_guest', name: 'Invitado', role: 'viewer', avatar: '👀', color: 'bg-gray-400', password: 'guest' }
    ],
    settings: {
        theme: 'ocean',
        lastView: 'boards'
    },
    activityLog: [],
    currentBoardId: null,
    currentMatrixId: null,
    currentUser: null
};

// Objeto de estado mutable global
export const state = {};

// Inicializar con copia profunda del estado inicial
Object.assign(state, JSON.parse(JSON.stringify(INITIAL_STATE)));

const STORAGE_KEY = 'kanban_eisenhower_state_v3';

export const StateManager = {
    save() {
        try {
            // No guardar currentUser en localStorage por seguridad (solo guardar el ID)
            const toSave = { ...state, currentUser: null };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
        } catch (e) {
            console.error('[StateManager] Error al guardar:', e);
        }
    },

    load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return false;

            const saved = JSON.parse(raw);

            // Preservar la lista de usuarios del estado inicial si el guardado no tiene usuarios válidos
            if (!saved.users || saved.users.length === 0) {
                saved.users = JSON.parse(JSON.stringify(INITIAL_STATE.users));
            }
            if (!saved.members || saved.members.length === 0) {
                saved.members = JSON.parse(JSON.stringify(INITIAL_STATE.members));
            }
            if (!saved.settings) {
                saved.settings = JSON.parse(JSON.stringify(INITIAL_STATE.settings));
            }

            Object.assign(state, saved);
            // Asegurar que currentUser esté limpio al cargar
            state.currentUser = null;
            return true;
        } catch (e) {
            console.error('[StateManager] Error al cargar:', e);
            return false;
        }
    },

    reset() {
        Object.assign(state, JSON.parse(JSON.stringify(INITIAL_STATE)));
        localStorage.removeItem(STORAGE_KEY);
    }
};
