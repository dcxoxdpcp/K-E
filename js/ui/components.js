/**
 * js/ui/components.js - Componentes Reutilizables de UI v3.2
 *
 * CAMBIO CLAVE: Los permisos se verifican en tiempo de clic (no en tiempo de render)
 * para evitar el bug donde state.currentUser es null durante la renderización,
 * lo que causaba que todas las tarjetas de tarea se trataran como 'invitado'.
 */

import { state } from '../store/state.js';
import { PermissionsService } from '../services/auth.js';
import { escapeHTML } from './utils.js';

export const UIComponents = {
    createTaskCard(task, board, handlers) {
        const template = document.getElementById('task-card-template');
        if (!template) {
            console.error('[UIComponents] task-card-template no encontrado en el DOM');
            return document.createElement('div');
        }

        const taskEl = template.content.cloneNode(true).firstElementChild;
        taskEl.dataset.taskId = task.id;

        // --- TITULO ---
        const titleEl = taskEl.querySelector('.task-title');
        if (titleEl) titleEl.textContent = task.title;

        // --- LABELS ---
        const labelsContainer = taskEl.querySelector('.task-labels-container');
        if (labelsContainer) {
            labelsContainer.innerHTML = '';
            (task.labels || []).forEach(labelName => {
                const span = document.createElement('span');
                span.textContent = labelName;
                span.className = `task-label ${board.labels?.[labelName] || 'bg-gray-200 text-gray-700'}`;
                labelsContainer.appendChild(span);
            });
        }

        // --- FECHA LIMITE ---
        const dueDateContainer = taskEl.querySelector('.task-due-date');
        if (dueDateContainer) {
            if (task.dueDate) {
                const dueDate = new Date(task.dueDate + 'T00:00:00');
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                let dateText = task.dueDate;
                try {
                    dateText = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(dueDate);
                } catch (e) { }
                dueDateContainer.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>${dateText}</span>
                `;
                dueDateContainer.classList.remove('hidden');
                if (dueDate < today) dueDateContainer.classList.add('text-red-500', 'font-bold');
            } else {
                dueDateContainer.classList.add('hidden');
            }
        }

        // --- FECHA CREACION ---
        const createdAtContainer = taskEl.querySelector('.task-created-at');
        if (createdAtContainer && task.createdAt) {
            const createdAt = new Date(task.createdAt);
            let createdDateText = task.createdAt.split('T')[0];
            try {
                createdDateText = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(createdAt);
            } catch (e) { }
            createdAtContainer.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>${createdDateText}</span>
            `;
            createdAtContainer.classList.remove('hidden');
        }

        // --- AVATAR ---
        const assigneeAvatar = taskEl.querySelector('.task-assignee-avatar');
        if (assigneeAvatar) {
            if (task.assigneeId) {
                const member = state.members.find(m => m.id === task.assigneeId);
                if (member) {
                    assigneeAvatar.classList.remove('hidden');
                    assigneeAvatar.textContent = member.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
                    assigneeAvatar.className = `task-assignee-avatar w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold shadow-sm ${member.color}`;
                } else {
                    assigneeAvatar.classList.add('hidden');
                }
            } else {
                assigneeAvatar.classList.add('hidden');
            }
        }

        // --- HANDLERS ---
        // IMPORTANTE: Los permisos se verifican en tiempo de clic (no en tiempo de render).
        taskEl.onclick = (e) => {
            if (e.target.closest('button') || e.target.closest('.drag-handle')) return;
            // No permitir abrir el modal de edición si no tiene permiso sobre esta tarea
            if (!PermissionsService.can('edit_task', task)) return;
            if (handlers?.onEdit) handlers.onEdit(task.id);
        };

        const delBtn = taskEl.querySelector('.delete-task-btn');
        if (delBtn) {
            if (PermissionsService.can('delete_task', task)) {
                delBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (handlers?.onDelete) handlers.onDelete(task.id);
                };
            } else {
                delBtn.style.display = 'none';
            }
        }

        const exportBtn = taskEl.querySelector('.export-to-matrix-btn');
        if (exportBtn) {
            exportBtn.onclick = (e) => {
                e.stopPropagation();
                if (!PermissionsService.can('export_to_matrix')) return;
                if (handlers?.onExportToMatrix) handlers.onExportToMatrix(task.id);
            };
            if (PermissionsService.can('view_only')) exportBtn.style.display = 'none';
        }

        // Marcar visualmente si es invitado (para estilos CSS específicos)
        if (PermissionsService.can('view_only')) {
            taskEl.classList.add('is-guest');
        }

        return taskEl;
    }
};
