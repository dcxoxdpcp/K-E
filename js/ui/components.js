/**
 * js/ui/components.js - Componentes Reutilizables de UI
 */

import { state, AVATAR_OPTIONS } from '../store/state.js';
import { PermissionsService } from '../services/auth.js';
import { escapeHTML } from './utils.js';

export const UIComponents = {
    createTaskCard(task, board, handlers) {
        const taskEl = document.getElementById('task-card-template').content.cloneNode(true).firstElementChild;
        taskEl.dataset.taskId = task.id;
        taskEl.classList.add('group');

        const currentUser = state.currentUser;
        const isGuest = currentUser?.role === 'viewer' || currentUser?.role === 'invitado';

        if (isGuest) taskEl.classList.add('is-guest');

        taskEl.setAttribute('role', 'listitem');
        taskEl.setAttribute('aria-label', `Tarea: ${task.title}`);

        const dragHandleHTML = isGuest ? '' : `
            <div class="drag-handle absolute right-0 top-0 bottom-0 w-6 flex items-center justify-center cursor-grab opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <div class="dots w-1.5 h-4 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNiIgaGVpZ2h0PSI2IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxnY2lyY2xlIGN4PSIyIiBjeT0iMiIgcj0iMSIgZmlsbD0iIzk0YTNYOCIvPjwvc3ZnPg==')] opacity-50"></div>
            </div>
        `;

        const cursorClass = isGuest ? 'cursor-default' : 'cursor-pointer hover:text-[var(--primary)]';

        taskEl.innerHTML = `
            ${dragHandleHTML}
            <div class="flex justify-between items-start mb-2 pr-6">
                <h3 class="font-medium text-[var(--color-text-primary)] leading-tight transition-colors task-title ${cursorClass}">${escapeHTML(task.title)}</h3>
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity relative z-20">
                     ${!isGuest ? `
                     <button class="export-to-matrix-btn p-1 rounded hover:bg-purple-100 dark:hover:bg-purple-900 text-gray-400 hover:text-purple-500" title="Enviar a Matriz Eisenhower">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    </button>
                    <button class="delete-task-btn p-1 rounded hover:bg-red-100 dark:hover:bg-red-900 text-gray-400 hover:text-red-500" title="Eliminar">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>` : ''}
                </div>
            </div>
            <div class="task-labels-container flex flex-wrap gap-1 mb-2"></div>
            <div class="flex items-center justify-between mt-3">
                <div class="flex items-center gap-2 text-xs">
                    <div class="task-due-date flex items-center gap-1 px-2 py-0.5 rounded-md hidden"></div>
                    <div class="task-created-at flex items-center gap-1 text-[var(--color-text-secondary)] hidden" title="Fecha de creación"></div>
                </div>
                <div class="task-assignee-avatar hidden"></div>
            </div>
        `;

        // Labels
        const labelsContainer = taskEl.querySelector('.task-labels-container');
        task.labels.forEach(labelName => {
            const labelEl = document.createElement('span');
            labelEl.textContent = labelName;
            labelEl.className = `task-label ${board.labels[labelName] || 'bg-gray-200 text-gray-800'}`;
            labelsContainer.appendChild(labelEl);
        });

        // Due Date
        if (task.dueDate) {
            const dueDateContainer = taskEl.querySelector('.task-due-date');
            const dueDate = new Date(task.dueDate + 'T00:00:00');
            const today = new Date(); today.setHours(0, 0, 0, 0);
            let dateText = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(dueDate);
            dueDateContainer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg><span class="text-red-600 dark:text-red-400 font-medium">${dateText}</span>`;
            dueDateContainer.classList.remove('hidden');
            dueDateContainer.classList.add('bg-red-100', 'dark:bg-red-900/30', 'px-2', 'py-1', 'rounded-md');
            if (dueDate < today) {
                dueDateContainer.classList.add('font-bold');
                taskEl.classList.add('border-red-400');
            }
        }

        // Assignee
        if (task.assigneeId) {
            const member = state.members.find(m => m.id === task.assigneeId);
            if (member) {
                const assigneeAvatar = taskEl.querySelector('.task-assignee-avatar');
                assigneeAvatar.classList.remove('hidden');
                assigneeAvatar.textContent = member.name.split(' ').map(n => n[0]).join('').toUpperCase();
                assigneeAvatar.className = `task-assignee-avatar w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-white font-bold shadow-sm ${member.color}`;
                assigneeAvatar.title = `Asignado a: ${member.name}`;
            }
        }

        // Handlers
        if (!isGuest && handlers) {
            taskEl.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.closest('.drag-handle')) return;
                handlers.onEdit(task.id);
            });
            taskEl.querySelector('.export-to-matrix-btn')?.addEventListener('click', (e) => { e.stopPropagation(); handlers.onExport(task.id); });
            taskEl.querySelector('.delete-task-btn')?.addEventListener('click', (e) => { e.stopPropagation(); handlers.onDelete(task.id); });
        }

        return taskEl;
    },

    createMatrixTask(task, handlers) {
        const taskEl = document.getElementById('matrix-task-template').content.cloneNode(true).firstElementChild;
        const isGuest = state.currentUser?.role === 'viewer' || state.currentUser?.role === 'invitado';
        taskEl.dataset.taskId = task.id;
        taskEl.draggable = !isGuest;
        const titleEl = taskEl.querySelector('.matrix-task-title');
        titleEl.textContent = task.title;
        const checkbox = taskEl.querySelector('.task-completed-checkbox');
        checkbox.checked = task.completed;
        titleEl.classList.toggle('line-through', task.completed);
        titleEl.classList.toggle('text-gray-500', task.completed);

        if (isGuest) {
            checkbox.disabled = true;
            taskEl.classList.add('opacity-70', 'cursor-default');
        } else if (handlers) {
            checkbox.addEventListener('change', () => handlers.onToggle(task.id, checkbox));
        }

        if (task.origin) {
            const originLink = taskEl.querySelector('.task-origin-link');
            const board = state.boards.find(b => b.id === task.origin.boardId);
            if (board) {
                originLink.textContent = `Desde: ${board.name}`;
                originLink.addEventListener('click', () => handlers.onGoToBoard(board.id));
            }
        }

        if (PermissionsService.can('delete_matrix_task', task)) {
            taskEl.querySelector('.delete-matrix-task-btn').addEventListener('click', () => handlers.onDelete(task.id));
        } else {
            taskEl.querySelector('.delete-matrix-task-btn').remove();
        }

        return taskEl;
    }
};
