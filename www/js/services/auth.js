/**
 * js/services/auth.js - Autenticación y Permisos v3.1
 */

import { state } from '../store/state.js';

export const AuthService = {
    login(userId, password) {
        const user = state.users.find(u => u.id === userId);
        if (user && user.password === password) {
            state.currentUser = { ...user };
            return { success: true, user };
        }
        return { success: false, message: 'Credenciales inválidas' };
    },

    logout() {
        state.currentUser = null;
    },

    updateProfile(userId, updates) {
        const userIdx = state.users.findIndex(u => u.id === userId);
        if (userIdx === -1) return { success: false, message: 'Usuario no encontrado' };
        state.users[userIdx] = { ...state.users[userIdx], ...updates };
        if (state.currentUser && state.currentUser.id === userId) {
            state.currentUser = { ...state.users[userIdx] };
        }
        return { success: true };
    },

    createUser(userData) {
        const newUser = {
            id: `u_${Date.now()}`,
            name: userData.name || 'Nuevo Usuario',
            role: userData.role || 'member',
            avatar: userData.avatar || '🧑',
            color: userData.color || 'bg-slate-500',
            password: userData.password || '1234',
            linkedMemberId: userData.linkedMemberId || null
        };
        state.users.push(newUser);
        return { success: true, user: newUser };
    }
};

export const PermissionsService = {
    can(action, resource = null) {
        const user = state.currentUser;
        if (!user) return false;

        // Admin/Gerente puede todo (excepto cuando se verifica explícitamente si es "view_only")
        if (user.role === 'admin' && action !== 'view_only') return true;

        switch (action) {
            case 'create_board':
            case 'create_matrix':
            case 'create_task':
            case 'add_column':
            case 'export_to_matrix':
            case 'add_matrix_task': // añadir tareas directamente en matrices
                // Miembros pueden crear todo
                return user.role === 'admin' || user.role === 'member';

            case 'manage_users':
            case 'manage_members':
                // Solo Admin
                return user.role === 'admin';

            case 'delete_board':
            case 'edit_board': // para renombrar o borrar columnas
            case 'delete_matrix':
                // Miembro solo puede si él lo creó (ownerId)
                if (user.role === 'member') {
                    if (resource && resource.ownerId === user.id) return true;
                    return false;
                }
                return user.role === 'admin';

            case 'edit_task':
            case 'delete_task':
                // Miembro solo puede editar/borrar SI ÉL mismo creó la tarea de tablero
                if (user.role === 'member') {
                    if (resource && (resource.createdBy === user.id || resource.ownerId === user.id)) return true;
                    return false;
                }
                return user.role === 'admin';

            case 'delete_matrix_task':
                // Miembro solo puede borrar si él exportó/creó la tarea de matriz
                if (user.role === 'member') {
                    if (resource && resource.exportedBy === user.id) return true;
                    return false;
                }
                return user.role === 'admin';

            case 'delete_column':
            case 'edit_column':
                // Mismas reglas que edit_board (si es dueño del tablero)
                if (user.role === 'member') {
                    if (resource && resource.ownerId === user.id) return true;
                    return false;
                }
                return user.role === 'admin';

            case 'move_task':
            case 'toggle_matrix_task':
                // Miembros SÍ pueden arrastrar tareas entre columnas (incluso del Admin)
                // y tacharlas en la matriz (incluso del Admin) sin importar el creador, 
                // ya que es parte de la colaboración general.
                return user.role === 'admin' || user.role === 'member';

            case 'view_only':
                return user.role === 'viewer';

            default:
                // Fallback de seguridad, ante duda, como create
                return user.role === 'admin' || user.role === 'member';
        }
    }
};
