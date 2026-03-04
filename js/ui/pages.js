/**
 * js/ui/pages.js - Renderizado de Vistas Completo
 */

import { state } from '../store/state.js';
import { UIComponents } from './components.js';
import { escapeHTML } from './utils.js';
import { PermissionsService } from '../services/auth.js';

const DOM = {
    get boardsGrid() { return document.getElementById('boards-grid'); },
    get matricesGrid() { return document.getElementById('matrices-grid'); },
    get boardColumns() { return document.getElementById('board-columns-container'); },
    get boardTitle() { return document.getElementById('board-title'); },
    get matrixTitle() { return document.getElementById('matrix-title'); },
    get navTabs() { return document.querySelectorAll('.nav-tab'); },
    get taskSearch() { return document.getElementById('task-search-input'); },
    get labelFilter() { return document.getElementById('label-filter-select'); },
    get memberFilter() { return document.getElementById('member-filter-select'); },
    get presenceContainer() { return document.getElementById('online-users-container'); }
};

export const PageRenderers = {
    showView(viewName) {
        const views = ['boards-gallery-view', 'matrices-gallery-view', 'board-detail-view', 'matrix-detail-view', 'dashboard-view'];
        views.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

        let targetId = '';
        if (viewName === 'boards') {
            targetId = state.currentBoardId ? 'board-detail-view' : 'boards-gallery-view';
        } else if (viewName === 'matrices') {
            targetId = state.currentMatrixId ? 'matrix-detail-view' : 'matrices-gallery-view';
        } else if (viewName === 'dashboard') {
            targetId = 'dashboard-view';
        }

        const target = document.getElementById(targetId);
        if (target) target.classList.remove('hidden');

        DOM.navTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === viewName);
            // Visual active state
            if (tab.dataset.view === viewName) {
                tab.classList.add('border-b-2', 'border-blue-600', 'text-blue-600');
            } else {
                tab.classList.remove('border-b-2', 'border-blue-600', 'text-blue-600');
            }
        });

        if (state.settings) state.settings.lastView = viewName;
    },

    renderBoardsGallery(handlers) {
        const grid = DOM.boardsGrid;
        if (!grid) return;
        grid.innerHTML = '';

        if (state.boards.length === 0) {
            grid.innerHTML = '<div class="col-span-full py-20 text-center text-gray-500"><h3>No hay tableros aún. ¡Crea el primero!</h3></div>';
            return;
        }

        state.boards.forEach(board => {
            const template = document.getElementById('board-card-template');
            const card = template.content.cloneNode(true).firstElementChild;
            card.querySelector('.board-name').textContent = board.name;

            card.onclick = (e) => {
                if (!e.target.closest('button')) handlers.onOpen(board.id);
            };

            const deleteBtn = card.querySelector('.delete-board-btn');
            if (PermissionsService.can('delete_board', board)) {
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    handlers.onDelete(board.id);
                };
            } else {
                deleteBtn.remove();
            }

            grid.appendChild(card);
        });
    },

    renderBoard(boardId, handlers) {
        const board = state.boards.find(b => b.id === boardId);
        if (!board) return;

        state.currentBoardId = boardId;
        DOM.boardTitle.textContent = board.name;

        const container = DOM.boardColumns;
        container.querySelectorAll('.column').forEach(c => c.remove());

        const fragment = document.createDocumentFragment();
        board.columns.forEach(column => {
            const columnEl = this.createColumnElement(column, board, handlers);
            fragment.appendChild(columnEl);
        });

        container.appendChild(fragment);
        this.populateFilters(board);
    },

    createColumnElement(column, board, handlers) {
        const template = document.getElementById('column-template');
        const columnEl = template.content.cloneNode(true).firstElementChild;
        columnEl.dataset.columnId = column.id;
        columnEl.querySelector('.column-title').textContent = column.name;

        const taskCount = column.tasks.length;
        const countSpan = columnEl.querySelector('.task-count');
        countSpan.textContent = taskCount;

        const tasksContainer = columnEl.querySelector('.tasks-container');
        column.tasks.forEach(taskId => {
            const task = board.tasks[taskId];
            if (task) {
                // Filtros básicos
                const searchText = DOM.taskSearch?.value.toLowerCase() || '';
                const labelFilter = DOM.labelFilter?.value || '';
                const memberFilter = DOM.memberFilter?.value || '';

                const matchesSearch = !searchText || task.title.toLowerCase().includes(searchText);
                const matchesLabel = !labelFilter || task.labels.includes(labelFilter);
                const matchesMember = !memberFilter || task.assigneeId === memberFilter;

                if (matchesSearch && matchesLabel && matchesMember) {
                    tasksContainer.appendChild(UIComponents.createTaskCard(task, board, handlers));
                }
            }
        });

        columnEl.querySelector('.add-task-btn').onclick = () => handlers.onAddTask(column.id);
        return columnEl;
    },

    populateFilters(board) {
        if (!board || !DOM.labelFilter) return;

        const currentLabel = DOM.labelFilter.value;
        DOM.labelFilter.innerHTML = '<option value="">Etiquetas</option>';
        Object.keys(board.labels || {}).forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            if (name === currentLabel) opt.selected = true;
            DOM.labelFilter.appendChild(opt);
        });

        const currentMember = DOM.memberFilter.value;
        DOM.memberFilter.innerHTML = '<option value="">Miembros</option>';
        state.members.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            if (m.id === currentMember) opt.selected = true;
            DOM.memberFilter.appendChild(opt);
        });
    },

    renderPresence(presenceState) {
        if (!DOM.presenceContainer) return;
        DOM.presenceContainer.innerHTML = '';
        Object.values(presenceState).forEach(presences => {
            const p = presences[0];
            const avatar = document.createElement('div');
            avatar.className = "w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-xs shadow-sm bg-blue-500 text-white font-bold cursor-help";
            avatar.title = p.name;
            avatar.textContent = p.name.charAt(0).toUpperCase();
            DOM.presenceContainer.appendChild(avatar);
        });
    }
};
