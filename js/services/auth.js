/**
 * js/services/auth.js - Servicio de Autenticación y Permisos
 */

import { state, DEFAULT_USERS, StorageProvider } from '../store/state.js';

export const PermissionsService = {
    can(action, context = null) {
        const user = state.currentUser;
        if (!user) return false;
        if (user.role === 'admin') return true;

        const isGuest = user.role === 'viewer' || user.role === 'invitado';
        if (isGuest) return false;

        if (context && context.ownerId === user.id) return true;

        switch (action) {
            case 'create_board':
            case 'create_matrix':
            case 'manage_team':
            case 'manage_labels':
            case 'import_board':
            case 'create_task':
            case 'edit_task':
            case 'move_task':
            case 'export_to_matrix':
                return true;
            case 'delete_board':
            case 'delete_matrix':
            case 'delete_task':
            case 'delete_column':
            case 'delete_matrix_task':
                return false;
            default:
                return true;
        }
    }
};

export const AuthService = {
    login(userId, password) {
        const user = state.users.find(u => u.id === userId);
        if (!user) return { success: false, message: 'Usuario no encontrado' };

        if (user.password === password) {
            // Clonar usuario sin la contraseña para la sesión activa
            state.currentUser = { ...user };
            delete state.currentUser.password;
            return { success: true, user: state.currentUser };
        }
        return { success: false, message: 'Contraseña incorrecta' };
    },

    logout() {
        state.currentUser = null;
        StorageProvider.save(state);
        location.reload();
    },

    updateProfile(userId, data) {
        const userIndex = state.users.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
            state.users[userIndex] = { ...state.users[userIndex], ...data };
            if (state.currentUser && state.currentUser.id === userId) {
                state.currentUser = { ...state.currentUser, ...data };
            }
            return true;
        }
        return false;
    }
};
