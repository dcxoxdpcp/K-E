/**
 * js/ui/pages.js - Renderizado de Vistas v3.1
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
        const views = [
            'boards-gallery-view',
            'matrices-gallery-view',
            'board-detail-view',
            'matrix-detail-view',
            'dashboard-view'
        ];

        views.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.add('hidden');
                el.style.display = 'none';
            }
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
        if (target) {
            target.classList.remove('hidden');
            if (targetId === 'board-detail-view' || targetId === 'matrix-detail-view') {
                target.style.display = 'flex';
            } else {
                target.style.display = 'block';
            }
        }

        // Activar pestaña correcta
        DOM.navTabs.forEach(tab => {
            const shouldBeActive = tab.dataset.view === viewName;
            tab.classList.toggle('active', shouldBeActive);
        });

        if (state.settings) state.settings.lastView = viewName;

        if (viewName === 'dashboard') this.renderDashboard();
    },

    // ---------------------------------------------------------------
    // GALERÍA DE TABLEROS
    // ---------------------------------------------------------------
    renderBoardsGallery(handlers) {
        const grid = DOM.boardsGrid;
        if (!grid) return;
        grid.innerHTML = '';

        if (!state.boards || state.boards.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full py-20 text-center">
                    <div class="text-6xl mb-4">📋</div>
                    <h3 class="text-xl font-bold mb-2 text-[var(--color-text-secondary)]">Sin tableros todavía</h3>
                    <p class="text-[var(--color-text-secondary)] mb-6">Crea tu primer tablero para empezar a organizar tareas.</p>
                </div>`;
            return;
        }

        state.boards.forEach(board => {
            const taskCount = Object.keys(board.tasks || {}).length;
            const card = document.createElement('div');
            card.className = `gallery-card bg-[var(--color-card-bg)] rounded-xl shadow-sm border border-[var(--color-border)]
                              border-l-4 border-l-[var(--primary)] p-5 cursor-pointer group
                              hover:shadow-lg hover:-translate-y-1 transition-all duration-200`;
            card.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                    <h3 class="board-name font-bold text-lg text-[var(--color-text-primary)] leading-tight">${escapeHTML(board.name)}</h3>
                    <button class="delete-board-btn opacity-0 group-hover:opacity-100 p-2 hover:bg-red-50 text-red-400
                                   hover:text-red-600 rounded-lg transition-all" title="Eliminar tablero">🗑️</button>
                </div>
                <div class="flex items-center gap-4 text-sm text-[var(--color-text-secondary)] mt-4">
                    <span>📌 ${board.columns?.length || 0} columnas</span>
                    <span>✅ ${taskCount} tareas</span>
                </div>`;

            card.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-board-btn')) handlers.onOpen(board.id);
            });

            const delBtn = card.querySelector('.delete-board-btn');
            if (delBtn) {
                if (PermissionsService.can('delete_board', board)) {
                    delBtn.addEventListener('click', (e) => { e.stopPropagation(); handlers.onDelete(board.id); });
                } else {
                    delBtn.remove();
                }
            }

            grid.appendChild(card);
        });
    },

    // ---------------------------------------------------------------
    // DETALLE DE TABLERO (KANBAN)
    // ---------------------------------------------------------------
    renderBoard(boardId, handlers) {
        const board = state.boards.find(b => b.id === boardId);
        if (!board) { state.currentBoardId = null; return; }

        state.currentBoardId = boardId;
        if (DOM.boardTitle) DOM.boardTitle.textContent = board.name;

        const container = DOM.boardColumns;
        if (!container) return;
        container.innerHTML = '';

        (board.columns || []).forEach(column => {
            container.appendChild(this.createColumnElement(column, board, handlers));
        });

        this.populateFilters(board);
    },

    createColumnElement(column, board, handlers) {
        const taskCount = (column.tasks || []).length;
        const wipExceeded = column.wipLimit > 0 && taskCount >= column.wipLimit;

        const colEl = document.createElement('div');
        colEl.className = `column bg-[var(--color-bg-secondary)] rounded-xl w-72 flex-shrink-0 flex flex-col ${wipExceeded ? 'wip-exceeded' : ''}`;
        colEl.style.maxHeight = '100%';
        colEl.dataset.columnId = column.id;

        const wipBadge = column.wipLimit > 0
            ? `<span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${wipExceeded ? 'bg-red-500 text-white' : 'bg-[var(--color-border)] text-[var(--color-text-secondary)]'}">
                   ${taskCount}/${column.wipLimit}
               </span>`
            : `<span class="task-count bg-[var(--color-border)] text-[var(--color-text-secondary)] text-xs px-2 py-0.5 rounded-full">${taskCount}</span>`;

        const canEditCol = PermissionsService.can('edit_column', board);
        const canAddTask = PermissionsService.can('create_task');

        colEl.innerHTML = `
            <div class="column-header p-3 border-b border-[var(--color-border)] flex justify-between items-center">
                <div class="flex items-center gap-2 min-w-0">
                    ${canEditCol ? `<span class="column-drag-handle cursor-grab opacity-40 hover:opacity-100 text-xs select-none pr-1">⠿</span>` : ''}
                    <span class="column-title font-semibold truncate text-[var(--color-text-primary)]">${escapeHTML(column.name)}</span>
                    ${wipBadge}
                </div>
                ${canEditCol ? `
                <div class="relative">
                    <button class="col-menu-btn p-1 rounded-lg hover:bg-[var(--color-bg-secondary)] opacity-0 group-hover:opacity-100 text-[var(--color-text-secondary)]">⋮</button>
                    <div class="col-menu hidden absolute right-0 top-7 bg-[var(--color-card-bg)] shadow-xl rounded-xl border border-[var(--color-border)] z-30 w-44 py-1">
                        <button class="rename-column-btn w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-bg-secondary)]">✏️ Renombrar</button>
                        <div class="border-t border-[var(--color-border)] my-1"></div>
                        <div class="px-4 py-1 text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Ordenar</div>
                        <button class="sort-priority-btn w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-bg-secondary)]">🔥 Por Prioridad</button>
                        <button class="sort-due-btn w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-bg-secondary)]">⏰ Por Vencimiento</button>
                        <button class="sort-alpha-btn w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-bg-secondary)]">🔤 Alfabéticamente</button>
                        <div class="border-t border-[var(--color-border)] my-1"></div>
                        <button class="delete-column-btn w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-bg-secondary)] text-red-500">🗑️ Eliminar</button>
                    </div>
                </div>` : ''}
            </div>
            ${canAddTask ? `
            <button class="add-task-btn p-3 text-sm font-medium text-[var(--primary)] hover:bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] transition-colors w-full text-left flex items-center gap-2">
                <span class="text-lg">+</span> Añadir tarea
            </button>` : ''}
            <div class="tasks-container p-3 flex-grow overflow-y-auto space-y-2" data-column-id="${column.id}"></div>
        `;

        // Poblar tareas
        const tasksContainer = colEl.querySelector('.tasks-container');
        (column.tasks || []).forEach(taskId => {
            const task = board.tasks[taskId];
            if (task) {
                tasksContainer.appendChild(UIComponents.createTaskCard(task, board, {
                    onEdit: handlers.onEdit,
                    onDelete: handlers.onDeleteTask,
                    onExportToMatrix: handlers.onExportToMatrix
                }));
            }
        });

        // Botón añadir tarea
        colEl.querySelector('.add-task-btn')?.addEventListener('click', () => handlers.onAddTask(column.id));

        // Botón renombrar columna
        colEl.querySelector('.rename-column-btn')?.addEventListener('click', () => {
            handlers.onRenameColumn(column.id);
        });

        // Botones de Ordenamiento
        colEl.querySelector('.sort-priority-btn')?.addEventListener('click', () => handlers.onSortColumn(column.id, 'priority'));
        colEl.querySelector('.sort-due-btn')?.addEventListener('click', () => handlers.onSortColumn(column.id, 'dueDate'));
        colEl.querySelector('.sort-alpha-btn')?.addEventListener('click', () => handlers.onSortColumn(column.id, 'alpha'));

        // Botón eliminar columna
        colEl.querySelector('.delete-column-btn')?.addEventListener('click', () => {
            handlers.onDeleteColumn(column.id);
        });

        // Toggle menú columna
        const menuBtn = colEl.querySelector('.col-menu-btn');
        const menu = colEl.querySelector('.col-menu');
        if (menuBtn && menu) {
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.classList.toggle('hidden');
            });
            document.addEventListener('click', () => menu.classList.add('hidden'), { once: true });
        }

        // Mostrar botón de menú on hover
        colEl.classList.add('group');

        return colEl;
    },

    // ---------------------------------------------------------------
    // GALERÍA DE MATRICES
    // ---------------------------------------------------------------
    renderMatricesGallery(handlers) {
        const grid = DOM.matricesGrid;
        if (!grid) return;
        grid.innerHTML = '';

        if (!state.matrices || state.matrices.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full py-20 text-center">
                    <div class="text-6xl mb-4">🎯</div>
                    <h3 class="text-xl font-bold mb-2 text-[var(--color-text-secondary)]">Sin matrices todavía</h3>
                    <p class="text-[var(--color-text-secondary)] mb-6">Crea tu primera Matriz Eisenhower para priorizar decisiones.</p>
                </div>`;
            return;
        }

        state.matrices.forEach(matrix => {
            const totalTasks = Object.values(matrix.quadrants || {}).reduce((sum, arr) => sum + (arr || []).length, 0);
            const card = document.createElement('div');
            card.className = `gallery-card bg-[var(--color-card-bg)] rounded-xl shadow-sm border border-[var(--color-border)]
                              border-l-4 border-l-purple-500 p-5 cursor-pointer group
                              hover:shadow-lg hover:-translate-y-1 transition-all duration-200`;
            card.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                    <h3 class="matrix-name font-bold text-lg text-[var(--color-text-primary)] leading-tight">${escapeHTML(matrix.name)}</h3>
                    <button class="delete-matrix-btn opacity-0 group-hover:opacity-100 p-2 hover:bg-red-50 text-red-400
                                   hover:text-red-600 rounded-lg transition-all" title="Eliminar">🗑️</button>
                </div>
                <div class="grid grid-cols-2 gap-1 mt-3 mb-3">
                    ${['do', 'plan', 'delegate', 'eliminate'].map(q => `
                        <div class="text-[10px] px-2 py-1 rounded bg-[var(--color-bg-secondary)] flex items-center gap-1">
                            ${this.getQuadrantDot(q)}
                            <span>${(matrix.quadrants?.[q] || []).length} tareas</span>
                        </div>`).join('')}
                </div>
                <p class="text-xs text-[var(--color-text-secondary)]">📌 ${totalTasks} tareas en total</p>`;

            card.addEventListener('click', (e) => {
                if (!e.target.closest('.delete-matrix-btn')) handlers.onOpen(matrix.id);
            });

            const delBtn = card.querySelector('.delete-matrix-btn');
            if (delBtn) {
                if (PermissionsService.can('delete_matrix', matrix)) {
                    delBtn.addEventListener('click', (e) => { e.stopPropagation(); handlers.onDelete(matrix.id); });
                } else {
                    delBtn.remove();
                }
            }

            grid.appendChild(card);
        });
    },

    getQuadrantDot(q) {
        const colors = { do: 'bg-red-500', plan: 'bg-blue-500', delegate: 'bg-amber-500', eliminate: 'bg-slate-400' };
        return `<span class="w-2 h-2 rounded-full inline-block ${colors[q] || 'bg-gray-400'}"></span>`;
    },

    // ---------------------------------------------------------------
    // DETALLE DE MATRIZ (EISENHOWER)
    // ---------------------------------------------------------------
    renderMatrix(matrixId, handlers) {
        const matrix = state.matrices.find(m => m.id === matrixId);
        if (!matrix) { state.currentMatrixId = null; return; }

        state.currentMatrixId = matrixId;
        if (DOM.matrixTitle) DOM.matrixTitle.textContent = matrix.name;

        const quadrantDefs = [
            { key: 'do', id: 'q-do', color: 'red' },
            { key: 'plan', id: 'q-plan', color: 'blue' },
            { key: 'delegate', id: 'q-delegate', color: 'amber' },
            { key: 'eliminate', id: 'q-eliminate', color: 'slate' }
        ];

        quadrantDefs.forEach(({ key, id }) => {
            const container = document.querySelector(`#${id} .tasks`);
            if (!container) return;
            container.innerHTML = '';
            container.dataset.quadrant = key;

            (matrix.quadrants[key] || []).forEach(task => {
                container.appendChild(this.createMatrixTaskElement(task, matrixId, key, handlers));
            });

            // Botón Añadir tarea
            const addBtn = document.querySelector(`#${id} .add-matrix-task-btn`);
            if (addBtn) {
                addBtn.onclick = () => handlers.onAddMatrixTask(matrixId, key);
            }
        });
    },

    createMatrixTaskElement(task, matrixId, quadrant, handlers) {
        const el = document.createElement('div');
        el.className = `matrix-task group flex items-start gap-2 p-3 bg-[var(--color-card-bg)] rounded-lg border border-[var(--color-border)]
                         hover:shadow-sm transition-all ${task.completed ? 'opacity-60' : ''}`;
        el.dataset.taskId = task.id;
        el.dataset.quadrant = quadrant;

        const canEdit = PermissionsService.can('delete_matrix_task', task);

        const formatDate = (isoStr) => {
            if (!isoStr) return '';
            const d = new Date(isoStr);
            return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        };

        el.innerHTML = `
            <input type="checkbox" class="mt-0.5 accent-[var(--primary)] flex-shrink-0 w-4 h-4 cursor-pointer"
                   ${task.completed ? 'checked' : ''}>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-[var(--color-text-primary)] leading-snug ${task.completed ? 'line-through opacity-60' : ''}">${escapeHTML(task.title)}</p>
                ${task.origin ? `
                    <div class="mt-1 flex flex-col gap-0.5">
                        <span class="text-[10px] text-[var(--color-text-secondary)] font-medium">Enviada: ${formatDate(task.origin.exportedAt || task.createdAt || task.exportedAt)}</span>
                        <div class="matrix-board-link inline-flex items-center gap-1 text-[10px] bg-[var(--color-bg-secondary)] text-[var(--primary)] px-2 py-0.5 rounded-md hover:bg-[var(--primary)] hover:text-white cursor-pointer transition-colors w-fit" data-board-id="${escapeHTML(task.origin.boardId)}">
                            📋 ${escapeHTML(task.origin.boardName || 'Tablero')}
                        </div>
                    </div>
                ` : ''}
            </div>
            ${canEdit ? `
            <button class="del-matrix-task-btn opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 text-red-400 rounded text-xs transition-all">✕</button>
            ` : ''}
        `;

        el.querySelector('input[type="checkbox"]')?.addEventListener('change', () => {
            handlers.onToggleComplete(matrixId, quadrant, task.id);
        });

        // Event listener for the board link
        el.querySelector('.matrix-board-link')?.addEventListener('click', (e) => {
            e.stopPropagation();
            handlers.onOpenBoard(task.origin.boardId);
        });

        el.querySelector('.del-matrix-task-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            handlers.onDeleteMatrixTask(matrixId, quadrant, task.id);
        });

        return el;
    },

    // ---------------------------------------------------------------
    // DASHBOARD
    // ---------------------------------------------------------------
    renderDashboard() {
        const view = document.getElementById('dashboard-view');
        if (!view) return;

        const totalBoards = state.boards.length;
        const totalMatrices = state.matrices.length;
        const totalTasks = state.boards.reduce((sum, b) => sum + Object.keys(b.tasks || {}).length, 0);
        const completedMatrixTasks = state.matrices.reduce((sum, m) =>
            sum + Object.values(m.quadrants || {}).flat().filter(t => t.completed).length, 0);

        const statsContainer = document.getElementById('dashboard-stats');
        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="bg-[var(--color-card-bg)] p-6 rounded-xl border border-[var(--color-border)] shadow-sm">
                    <div class="text-3xl mb-2">📋</div>
                    <div class="text-3xl font-bold text-[var(--primary)]">${totalBoards}</div>
                    <p class="text-sm text-[var(--color-text-secondary)] mt-1">Tableros activos</p>
                </div>
                <div class="bg-[var(--color-card-bg)] p-6 rounded-xl border border-[var(--color-border)] shadow-sm">
                    <div class="text-3xl mb-2">✅</div>
                    <div class="text-3xl font-bold text-emerald-500">${totalTasks}</div>
                    <p class="text-sm text-[var(--color-text-secondary)] mt-1">Tareas en tableros</p>
                </div>
                <div class="bg-[var(--color-card-bg)] p-6 rounded-xl border border-[var(--color-border)] shadow-sm">
                    <div class="text-3xl mb-2">🎯</div>
                    <div class="text-3xl font-bold text-purple-500">${totalMatrices}</div>
                    <p class="text-sm text-[var(--color-text-secondary)] mt-1">Matrices Eisenhower</p>
                </div>
                <div class="bg-[var(--color-card-bg)] p-6 rounded-xl border border-[var(--color-border)] shadow-sm">
                    <div class="text-3xl mb-2">⚡</div>
                    <div class="text-3xl font-bold text-amber-500">${completedMatrixTasks}</div>
                    <p class="text-sm text-[var(--color-text-secondary)] mt-1">Decisiones completadas</p>
                </div>
            `;
        }

        // Distribución de tableros por miembro
        const memberLoad = document.getElementById('member-load-chart');
        if (memberLoad) {
            const loadMap = {};
            state.boards.forEach(board => {
                Object.values(board.tasks || {}).forEach(task => {
                    if (task.assigneeId) {
                        loadMap[task.assigneeId] = (loadMap[task.assigneeId] || 0) + 1;
                    }
                });
            });

            memberLoad.innerHTML = state.members.map(m => {
                const count = loadMap[m.id] || 0;
                return `
                    <div class="flex items-center gap-3">
                        <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${m.color}">
                            ${m.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </div>
                        <div class="flex-1">
                            <div class="flex justify-between text-xs mb-1">
                                <span class="font-medium">${escapeHTML(m.name)}</span>
                                <span class="text-[var(--color-text-secondary)]">${count} tarea${count !== 1 ? 's' : ''}</span>
                            </div>
                            <div class="bg-[var(--color-bg-secondary)] rounded-full h-2">
                                <div class="h-2 rounded-full ${m.color.replace('bg-', 'bg-')}" style="width:${Math.min(count * 15, 100)}%"></div>
                            </div>
                        </div>
                    </div>`;
            }).join('');
        }

        // Renderizar Historial de Actividad
        const activityContainer = document.getElementById('activity-log-container');
        if (activityContainer) {
            if (!state.activityLog || state.activityLog.length === 0) {
                activityContainer.innerHTML = `<p class="text-sm text-[var(--color-text-secondary)] text-center py-4">No hay actividad reciente.</p>`;
            } else {
                const getActionIcon = (action) => {
                    if (action.includes('BOARD')) return '📋';
                    if (action.includes('MATRIX')) return '🎯';
                    if (action.includes('MOVED')) return '➡️';
                    if (action.includes('COMPLETED')) return '✅';
                    if (action.includes('DELETED')) return '🗑️';
                    return '📝';
                };

                const formatDate = (isoStr) => {
                    const d = new Date(isoStr);
                    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                };

                activityContainer.innerHTML = state.activityLog.slice(0, 50).map(log => {
                    const authorInfo = state.users?.find(u => u.id === log.authorId) || { name: 'Sistema', avatar: '🤖', color: 'bg-gray-400' };
                    return `
                        <div class="flex items-start gap-3 p-3 rounded-xl hover:bg-[var(--color-bg-secondary)] transition-colors text-sm">
                            <div class="w-8 h-8 rounded-full ${authorInfo.color} text-white flex items-center justify-center font-bold shadow-sm flex-shrink-0">
                                ${authorInfo.avatar}
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex gap-2">
                                    <span class="font-semibold text-[var(--color-text-primary)]">${escapeHTML(authorInfo.name)}</span>
                                    <span class="text-[var(--color-text-secondary)]">${getActionIcon(log.action)}</span>
                                </div>
                                <p class="text-[var(--color-text-primary)] mt-0.5 leading-snug">${escapeHTML(log.details)}</p>
                                <p class="text-[10px] text-[var(--color-text-secondary)] font-medium mt-1 uppercase tracking-wider">${formatDate(log.timestamp)}</p>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    },

    // ---------------------------------------------------------------
    // PRESENCIA (Usuarios Online)
    // ---------------------------------------------------------------
    renderPresence(presenceState) {
        const container = DOM.presenceContainer;
        if (!container) return;
        container.innerHTML = '';
        Object.values(presenceState).forEach(presences => {
            const p = presences[0];
            if (!p) return;
            const div = document.createElement('div');
            div.className = 'w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[10px] bg-[var(--primary)] text-white font-bold shadow-sm';
            div.title = p.name;
            div.textContent = (p.name || 'U').charAt(0).toUpperCase();
            container.appendChild(div);
        });
    },

    // ---------------------------------------------------------------
    // FILTROS
    // ---------------------------------------------------------------
    populateFilters(board) {
        if (!board) return;

        if (DOM.labelFilter) {
            DOM.labelFilter.innerHTML = '<option value="">Todas las etiquetas</option>';
            Object.keys(board.labels || {}).forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                DOM.labelFilter.appendChild(opt);
            });
        }

        if (DOM.memberFilter) {
            DOM.memberFilter.innerHTML = '<option value="">Todos los miembros</option>';
            (state.members || []).forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.name;
                DOM.memberFilter.appendChild(opt);
            });
        }
    }
};
