/**
 * js/main.js - Orquestador Principal v3.1
 * Punto de entrada de la aplicación.
 */

import { state, StateManager, DEFAULT_LABELS } from './store/state.js';
import { generateUUID } from './store/state.js';
import { SyncService } from './services/sync.js';
import { AuthService, PermissionsService } from './services/auth.js';
import { ModalService } from './ui/modals.js';
import { PageRenderers } from './ui/pages.js';
import { showToast, escapeHTML } from './ui/utils.js';

const App = {
    sortableInstances: [],

    async init() {
        console.log("🚀 Eisenhower Agile v3.1: Iniciando...");
        try {
            StateManager.load();
            this.applyTheme();

            if (!state.currentUser) {
                this.showLoginScreen();
            } else {
                await this.startApp();
            }
        } catch (error) {
            console.error("💥 Error de inicio:", error);
            const crash = document.getElementById('crash-screen');
            if (crash) {
                crash.classList.remove('hidden');
                const msg = document.getElementById('crash-message');
                if (msg) msg.textContent = error.message || 'Error desconocido';
            }
        }
    },

    // =============================================================
    // AUTENTICACIÓN
    // =============================================================
    showLoginScreen() {
        const loginContainer = document.getElementById('login-container');
        const appContainer = document.getElementById('app');
        if (!loginContainer || !appContainer) return;

        loginContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');

        const grid = document.getElementById('user-select-grid');
        if (!grid) return;

        grid.innerHTML = state.users.map(u => `
            <div data-user-id="${u.id}"
                 class="user-card cursor-pointer bg-[var(--color-card-bg)] p-6 rounded-xl shadow-md
                        hover:shadow-xl transition-all text-center border-2 border-transparent
                        hover:border-[var(--primary)] hover:-translate-y-1">
                <div class="text-5xl mb-4">${u.avatar}</div>
                <h3 class="font-bold text-lg text-[var(--color-text-primary)]">${escapeHTML(u.name)}</h3>
                <span class="text-xs text-[var(--color-text-secondary)] uppercase font-bold tracking-wider">${u.role}</span>
            </div>
        `).join('');

        grid.querySelectorAll('.user-card').forEach(card => {
            card.addEventListener('click', () => {
                const userId = card.dataset.userId;
                const user = state.users.find(u => u.id === userId);
                if (!user) return;

                ModalService.show(`Iniciar sesión como ${escapeHTML(user.name)}`, `
                    <form id="login-form" class="space-y-4">
                        <div class="flex flex-col items-center mb-4">
                            <div class="text-6xl mb-2">${user.avatar}</div>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-1 text-[var(--color-text-secondary)]">Contraseña</label>
                            <input type="password" name="password" required autofocus
                                   class="w-full p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)] focus:outline-none focus:border-[var(--primary)] text-center text-lg tracking-widest">
                        </div>
                        <div class="flex justify-end gap-3 pt-4 mt-2">
                            <button type="button" onclick="App.hideModal()" class="px-4 py-2 rounded-xl bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:opacity-80">Cancelar</button>
                            <button type="submit" class="px-6 py-2 rounded-xl bg-[var(--primary)] text-white font-bold hover:opacity-90">Ingresar</button>
                        </div>
                    </form>
                `);

                document.getElementById('login-form')?.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const pwd = new FormData(e.target).get('password');
                    this.handleLogin(userId, pwd);
                });
            });
        });
    },

    async handleLogin(userId, password) {
        const user = state.users.find(u => u.id === userId);
        if (!user) { showToast("❌ Usuario no encontrado"); return; }
        const res = AuthService.login(userId, password);
        if (res.success) {
            ModalService.hide();
            document.getElementById('login-container').classList.add('hidden');
            document.getElementById('app').classList.remove('hidden');
            await this.startApp();
        } else {
            showToast(`❌ ${res.message}`);
        }
    },

    logout() {
        ModalService.hide();
        AuthService.logout();
        StateManager.save();
        state.currentBoardId = null;
        state.currentMatrixId = null;
        state.settings.lastView = 'boards';
        this.showLoginScreen();
    },

    // =============================================================
    // INICIO DE APP
    // =============================================================
    applyRemoteState(newState) {
        if (!newState) return;

        // 1. Salvar sesión local e identidad
        const localSession = {
            currentUser: state.currentUser ? { ...state.currentUser } : null,
            currentBoardId: state.currentBoardId,
            currentMatrixId: state.currentMatrixId,
            settings: state.settings ? JSON.parse(JSON.stringify(state.settings)) : {}
        };

        // 2. Sobrescribir estado completo con los datos de Supabase (La nube gana)
        Object.assign(state, newState);

        // 3. Restaurar la identidad del usuario y su pantalla
        if (localSession.currentUser) {
            // Repoblar currentUser directo de la nube para obtener su último 'theme'
            const cloudUser = state.users.find(u => u.id === localSession.currentUser.id);
            state.currentUser = cloudUser ? { ...cloudUser } : localSession.currentUser;
        }

        // Evitar restaurar un ID de pantalla si ese tablero/matriz fue borrado en la nube
        if (state.boards.some(b => b.id === localSession.currentBoardId)) {
            state.currentBoardId = localSession.currentBoardId;
        }
        if (state.matrices.some(m => m.id === localSession.currentMatrixId)) {
            state.currentMatrixId = localSession.currentMatrixId;
        }

        if (Object.keys(localSession.settings).length > 0) {
            state.settings = localSession.settings;
        }
    },

    async startApp() {
        // Sincronización con Supabase (no bloquea si falla)
        try {
            const result = await SyncService.init();
            if (result) {
                this.applyRemoteState(result);
                console.log("☁️ Estado inicial descargado y aplicado desde Supabase");
            }

            SyncService.trackPresence(state.currentUser, (presenceState) => {
                PageRenderers.renderPresence(presenceState);
            });

            SyncService.onUpdate((newState) => {
                this.applyRemoteState(newState);
                this.refresh();
                showToast("🔄 Modificaciones de otros usuarios recibidas");
            });
        } catch (e) {
            console.warn("⚠️ Supabase no disponible, modo offline:", e.message);
        }

        this.applyTheme();
        this.updateUserNav();
        this.bindGlobalEvents();
        this.refresh();
    },

    applyTheme() {
        const theme = state.currentUser?.theme || state.settings?.theme || 'ocean';
        document.documentElement.setAttribute('data-theme', theme);
    },

    updateUserNav() {
        const display = document.getElementById('current-user-display');
        if (!display || !state.currentUser) return;
        display.innerHTML = `
            <div class="flex items-center gap-2 px-3 py-1 bg-[var(--color-bg-secondary)]
                        rounded-full cursor-pointer hover:opacity-80 transition-opacity" id="profile-trigger">
                <span class="text-xl">${state.currentUser.avatar}</span>
                <span class="text-sm font-semibold hidden sm:block">${escapeHTML(state.currentUser.name)}</span>
                <svg class="w-3 h-3 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
            </div>`;
        document.getElementById('profile-trigger')?.addEventListener('click', () => this.showProfileMenu());
    },

    // =============================================================
    // AUDITORÍA Y METADATOS
    // =============================================================
    logActivity(action, entityType, entityId, details) {
        if (!state.activityLog) state.activityLog = [];
        state.activityLog.unshift({
            id: generateUUID(),
            authorId: state.currentUser?.id || 'system',
            action,
            entityType,
            entityId,
            details,
            timestamp: new Date().toISOString()
        });
        // Mantener un límite razonable para no inflar el JSON (ej. últimas 200 actividades)
        if (state.activityLog.length > 200) {
            state.activityLog = state.activityLog.slice(0, 200);
        }
    },

    // =============================================================
    // REFRESCO DE VISTA
    // =============================================================
    refresh() {
        const view = state.settings?.lastView || 'boards';
        PageRenderers.showView(view);
        this.destroySortables();

        const handlers = this.getHandlers();

        switch (view) {
            case 'boards':
                if (state.currentBoardId) {
                    PageRenderers.renderBoard(state.currentBoardId, handlers);
                    this.initSortable();
                } else {
                    PageRenderers.renderBoardsGallery(handlers);
                }
                break;
            case 'matrices':
                if (state.currentMatrixId) {
                    PageRenderers.renderMatrix(state.currentMatrixId, handlers);
                    this.initMatrixSortable();
                } else {
                    PageRenderers.renderMatricesGallery(handlers);
                }
                break;
            case 'dashboard':
                PageRenderers.renderDashboard();
                break;
        }

        StateManager.save();
    },

    // =============================================================
    // DRAG & DROP (SortableJS)
    // =============================================================
    destroySortables() {
        this.sortableInstances.forEach(s => s.destroy());
        this.sortableInstances = [];
    },

    initSortable() {
        if (!window.Sortable) return;
        const board = state.boards.find(b => b.id === state.currentBoardId);
        if (!board) return;

        // Sortable por columnas
        const columnsContainer = document.getElementById('board-columns-container');
        if (columnsContainer) {
            const colSortable = Sortable.create(columnsContainer, {
                animation: 150,
                handle: '.column-drag-handle',
                draggable: '.column',
                ghostClass: 'sortable-ghost',
                dragClass: 'sortable-drag',
                onEnd: (evt) => {
                    const cols = board.columns;
                    const moved = cols.splice(evt.oldIndex, 1)[0];
                    cols.splice(evt.newIndex, 0, moved);
                    this.save(true);
                }
            });
            this.sortableInstances.push(colSortable);
        }

        // Sortable por tareas (entre columnas)
        document.querySelectorAll('.tasks-container').forEach(container => {
            const taskSortable = Sortable.create(container, {
                group: 'tasks',
                animation: 200,
                ghostClass: 'sortable-ghost',
                dragClass: 'sortable-drag',
                handle: '.drag-handle',
                filter: '.is-guest',
                onEnd: (evt) => {
                    const { item, from, to, oldIndex, newIndex } = evt;
                    const taskId = item.dataset.taskId;
                    const fromColId = from.closest('[data-column-id]')?.dataset.columnId;
                    const toColId = to.closest('[data-column-id]')?.dataset.columnId;

                    if (!fromColId || !toColId) return;

                    const fromCol = board.columns.find(c => c.id === fromColId);
                    const toCol = board.columns.find(c => c.id === toColId);

                    if (fromCol) fromCol.tasks = fromCol.tasks.filter(id => id !== taskId);
                    if (toCol) {
                        toCol.tasks.splice(newIndex, 0, taskId);
                        const task = board.tasks[taskId];
                        if (task) {
                            if (!task.history) task.history = [];
                            task.history.push({
                                columnId: toColId,
                                columnName: toCol.name,
                                authorId: state.currentUser?.id,
                                enteredAt: new Date().toISOString()
                            });
                            task.updatedAt = new Date().toISOString();
                            this.logActivity('TASK_MOVED', 'task', taskId, `Movió "${task.title}" a la columna "${toCol.name}"`);
                        }
                    }

                    // Actualizar count visual sin re-render completo
                    from.closest('[data-column-id]')?.querySelector('.task-count')?.innerText &&
                        (from.closest('[data-column-id]').querySelector('.task-count').textContent = fromCol?.tasks.length || 0);
                    to.closest('[data-column-id]')?.querySelector('.task-count') &&
                        (to.closest('[data-column-id]').querySelector('.task-count').textContent = toCol?.tasks.length || 0);

                    this.save(true);
                }
            });
            this.sortableInstances.push(taskSortable);
        });
    },

    initMatrixSortable() {
        if (!window.Sortable) return;
        document.querySelectorAll('.matrix-tasks-container').forEach(container => {
            const s = Sortable.create(container, {
                group: 'matrix-tasks',
                animation: 200,
                ghostClass: 'sortable-ghost',
                onEnd: (evt) => {
                    const matrix = state.matrices.find(m => m.id === state.currentMatrixId);
                    if (!matrix) return;
                    const taskId = evt.item.dataset.taskId;
                    const fromQ = evt.from.dataset.quadrant;
                    const toQ = evt.to.dataset.quadrant;
                    if (fromQ === toQ) return;

                    const task = matrix.quadrants[fromQ].find(t => t.id === taskId);
                    matrix.quadrants[fromQ] = matrix.quadrants[fromQ].filter(t => t.id !== taskId);
                    matrix.quadrants[toQ].splice(evt.newIndex, 0, task);
                    this.save(true);
                }
            });
            this.sortableInstances.push(s);
        });
    },

    // =============================================================
    // HANDLERS PARA EVENTOS DE VISTAS
    // =============================================================
    getHandlers() {
        return {
            // --- TABLEROS ---
            onOpen: (id) => {
                if (state.settings.lastView === 'matrices') state.currentMatrixId = id;
                else state.currentBoardId = id;
                this.refresh();
            },
            onOpenBoard: (boardId) => {
                state.settings.lastView = 'boards';
                state.currentBoardId = boardId;
                this.refresh();
            },
            onDelete: (id) => {
                const isMatrix = state.settings.lastView === 'matrices';
                ModalService.confirm(
                    `Eliminar ${isMatrix ? 'Matriz' : 'Tablero'}`,
                    `Esta acción no se puede deshacer. ¿Confirmas?`,
                    () => {
                        if (isMatrix) {
                            const matrix = state.matrices.find(m => m.id === id);
                            state.matrices = state.matrices.filter(m => m.id !== id);
                            if (matrix) this.logActivity('MATRIX_DELETED', 'matrix', id, `Eliminó la matriz "${matrix.name}"`);
                        } else {
                            const board = state.boards.find(b => b.id === id);
                            state.boards = state.boards.filter(b => b.id !== id);
                            if (board) this.logActivity('BOARD_DELETED', 'board', id, `Eliminó el tablero "${board.name}"`);
                        }
                        this.save();
                        this.refresh();
                    }
                );
            },

            // --- KANBAN ---
            onAddTask: (colId) => this.showTaskForm(null, colId),
            onEdit: (taskId) => this.showTaskForm(taskId),
            onDeleteTask: (taskId) => {
                const board = state.boards.find(b => b.id === state.currentBoardId);
                if (!board) return;
                ModalService.confirm('Eliminar Tarea', '¿Eliminar esta tarea?', () => {
                    const taskTitle = board.tasks[taskId]?.title || 'desconocida';
                    delete board.tasks[taskId];
                    board.columns.forEach(col => {
                        col.tasks = col.tasks.filter(id => id !== taskId);
                    });
                    this.logActivity('TASK_DELETED', 'task', taskId, `Eliminó la tarea "${taskTitle}"`);
                    this.save();
                    this.refresh();
                });
            },
            onAddColumn: () => {
                ModalService.show('Nueva Columna', `
                    <form id="col-form" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium mb-1 text-[var(--color-text-secondary)]">Nombre de la columna</label>
                            <input type="text" name="name" required placeholder="ej: En Revisión"
                                   class="w-full p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)] focus:outline-none focus:border-[var(--primary)]">
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1 text-[var(--color-text-secondary)]">Límite WIP (0 = sin límite)</label>
                            <input type="number" name="wipLimit" value="0" min="0"
                                   class="w-full p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)] focus:outline-none focus:border-[var(--primary)]">
                        </div>
                        <div class="flex justify-end gap-3 pt-2">
                            <button type="button" onclick="App.hideModal()" class="px-4 py-2 rounded-xl bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:opacity-80">Cancelar</button>
                            <button type="submit" class="px-5 py-2 rounded-xl bg-[var(--primary)] text-white font-semibold hover:opacity-90">Crear</button>
                        </div>
                    </form>
                `);
                document.getElementById('col-form')?.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const data = Object.fromEntries(new FormData(e.target));
                    const board = state.boards.find(b => b.id === state.currentBoardId);
                    const newId = generateUUID();
                    board.columns.push({
                        id: newId,
                        name: data.name,
                        tasks: [],
                        wipLimit: parseInt(data.wipLimit) || 0
                    });
                    this.logActivity('COLUMN_ADDED', 'board', board.id, `Añadió la columna "${data.name}" al tablero "${board.name}"`);
                    ModalService.hide();
                    this.save();
                    this.refresh();
                });
            },
            onRenameColumn: (colId) => {
                const board = state.boards.find(b => b.id === state.currentBoardId);
                const col = board?.columns.find(c => c.id === colId);
                if (!col) return;
                ModalService.show('Renombrar Columna', `
                    <form id="rename-col-form" class="space-y-4">
                        <input type="text" name="name" value="${escapeHTML(col.name)}" required
                               class="w-full p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)] focus:outline-none focus:border-[var(--primary)]">
                        <div class="flex justify-end gap-3">
                            <button type="button" onclick="App.hideModal()" class="px-4 py-2 rounded-xl bg-[var(--color-bg-secondary)] hover:opacity-80">Cancelar</button>
                            <button type="submit" class="px-5 py-2 rounded-xl bg-[var(--primary)] text-white font-semibold">Guardar</button>
                        </div>
                    </form>
                `);
                document.getElementById('rename-col-form')?.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const newName = new FormData(e.target).get('name');
                    const oldName = col.name;
                    col.name = newName;
                    this.logActivity('COLUMN_RENAMED', 'column', colId, `Renombró la columna "${oldName}" a "${newName}"`);
                    ModalService.hide();
                    this.save();
                    this.refresh();
                });
            },
            onDeleteColumn: (colId) => {
                const board = state.boards.find(b => b.id === state.currentBoardId);
                const col = board?.columns.find(c => c.id === colId);
                if (!col) return;
                ModalService.confirm('Eliminar Columna', `¿Eliminar la columna "${col.name}" y todas sus tareas?`, () => {
                    col.tasks.forEach(taskId => {
                        delete board.tasks[taskId];
                        this.logActivity('TASK_DELETED', 'task', taskId, `Eliminó la tarea porque su columna "${col.name}" fue eliminada`);
                    });
                    board.columns = board.columns.filter(c => c.id !== colId);
                    this.logActivity('COLUMN_DELETED', 'column', colId, `Eliminó la columna "${col.name}" del tablero "${board.name}"`);
                    this.save();
                    this.refresh();
                });
            },
            onSortColumn: (colId, criteria) => {
                const board = state.boards.find(b => b.id === state.currentBoardId);
                const col = board?.columns.find(c => c.id === colId);
                if (!board || !col || col.tasks.length < 2) return;

                // Mapear los IDs a los objetos de las tareas
                const tasksObj = col.tasks.map(id => board.tasks[id]).filter(Boolean);

                tasksObj.sort((a, b) => {
                    if (criteria === 'alpha') {
                        return (a.title || '').localeCompare(b.title || '');
                    } else if (criteria === 'dueDate') {
                        // Fecha más próxima primero. Si no tiene fecha, va al final.
                        if (!a.dueDate && !b.dueDate) return 0;
                        if (!a.dueDate) return 1;
                        if (!b.dueDate) return -1;
                        return new Date(a.dueDate) - new Date(b.dueDate);
                    } else if (criteria === 'priority') {
                        // Inferencia por etiquetas: asocia palabras clave a puntajes
                        const getPrioScore = (t) => {
                            if (!t.labels || t.labels.length === 0) return 0;
                            const text = t.labels.join(' ').toLowerCase();
                            if (text.includes('urgente') || text.includes('urgent')) return 4;
                            if (text.includes('alta') || text.includes('high')) return 3;
                            if (text.includes('media') || text.includes('medium')) return 2;
                            if (text.includes('baja') || text.includes('low')) return 1;
                            return 0;
                        };
                        // Mayor a menor puntuación (Primero urgentes)
                        return getPrioScore(b) - getPrioScore(a);
                    }
                    return 0;
                });

                // Reconstruir lista de IDs
                col.tasks = tasksObj.map(t => t.id);

                const criteriaNames = { alpha: 'Alfabeto (A-Z)', dueDate: 'Vencimiento', priority: 'Prioridad' };
                this.logActivity('COLUMN_SORTED', 'column', colId, `Ordenó la columna "${col.name}" por ${criteriaNames[criteria]}`);
                this.save();
                this.refresh();
            },
            onExportToMatrix: (taskId) => this.showExportMatrixDialog(taskId),

            // --- MATRICES ---
            onToggleComplete: (matrixId, quadrant, taskId) => {
                const matrix = state.matrices.find(m => m.id === matrixId);
                if (!matrix) return;
                const task = matrix.quadrants[quadrant]?.find(t => t.id === taskId);
                if (task) {
                    // Si se va a marcar como completada y viene de un tablero, mostrar diálogo
                    if (!task.completed && task.origin && task.origin.boardId) {
                        const board = state.boards.find(b => b.id === task.origin.boardId);
                        if (board) {
                            this.showCompleteMatrixTaskDialog(matrixId, quadrant, task, board);
                            return; // Se detiene aquí, el modal se encargará de concluir
                        }
                    }

                    // Comportamiento normal (desmarcar o marcar si no viene de tablero)
                    task.completed = !task.completed;
                    this.logActivity(task.completed ? 'MATRIX_TASK_COMPLETED' : 'MATRIX_TASK_UNCOMPLETED', 'matrix_task', taskId, `Marcó como ${task.completed ? 'completada' : 'pendiente'} la tarea "${task.title}" en la matriz "${matrix.name}"`);
                    this.save(false);
                    this.refresh();
                }
            },
            onDeleteMatrixTask: (matrixId, quadrant, taskId) => {
                const matrix = state.matrices.find(m => m.id === matrixId);
                if (!matrix) return;
                const task = matrix.quadrants[quadrant]?.find(t => t.id === taskId);
                matrix.quadrants[quadrant] = matrix.quadrants[quadrant].filter(t => t.id !== taskId);
                this.logActivity('MATRIX_TASK_DELETED', 'matrix_task', taskId, `Eliminó la tarea de matriz "${task?.title || 'desconocida'}"`);
                this.save();
                this.refresh();
            },
            onAddMatrixTask: (matrixId, quadrant) => this.showAddMatrixTaskForm(matrixId, quadrant),
        };
    },

    // =============================================================
    // FORMULARIOS / MODALES
    // =============================================================
    showTaskForm(taskId = null, colId = null) {
        const board = state.boards.find(b => b.id === state.currentBoardId);
        if (!board) return;
        const task = taskId ? board.tasks[taskId] : null;

        const labelOptions = Object.keys(board.labels || {}).map(lbl => `
            <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" name="labels" value="${escapeHTML(lbl)}"
                       ${(task?.labels || []).includes(lbl) ? 'checked' : ''}>
                <span class="px-2 py-0.5 rounded-full text-xs font-medium ${board.labels[lbl]}">${escapeHTML(lbl)}</span>
            </label>
        `).join('');

        const memberOptions = state.members.map(m => `
            <option value="${m.id}" ${task?.assigneeId === m.id ? 'selected' : ''}>${escapeHTML(m.name)}</option>
        `).join('');

        ModalService.show(taskId ? '✏️ Editar Tarea' : '➕ Nueva Tarea', `
            <form id="task-form" class="space-y-4">
                <div>
                    <label class="block text-sm font-semibold mb-1 text-[var(--color-text-secondary)]">Título *</label>
                    <input type="text" name="title" value="${escapeHTML(task?.title || '')}" required
                           placeholder="¿Qué hay que hacer?"
                           class="w-full p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)]
                                  focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20">
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-1 text-[var(--color-text-secondary)]">Descripción</label>
                    <textarea name="description" rows="3"
                              placeholder="Detalles adicionales..."
                              class="w-full p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)]
                                     focus:outline-none focus:border-[var(--primary)] resize-none">${escapeHTML(task?.description || '')}</textarea>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-semibold mb-1 text-[var(--color-text-secondary)]">Vencimiento</label>
                        <input type="date" name="dueDate" value="${task?.dueDate || ''}"
                               class="w-full p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)]">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-1 text-[var(--color-text-secondary)]">Responsable</label>
                        <select name="assigneeId"
                                class="w-full p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)]">
                            <option value="">Sin asignar</option>
                            ${memberOptions}
                        </select>
                    </div>
                </div>
                ${labelOptions ? `
                <div>
                    <label class="block text-sm font-semibold mb-2 text-[var(--color-text-secondary)]">Etiquetas</label>
                    <div class="flex flex-wrap gap-3">${labelOptions}</div>
                </div>` : ''}
                <div class="flex justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
                    <button type="button" onclick="App.hideModal()"
                            class="px-4 py-2 rounded-xl bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:opacity-80">
                        Cancelar
                    </button>
                    <button type="submit"
                            class="px-5 py-2 rounded-xl bg-[var(--primary)] text-white font-semibold hover:opacity-90 transition-opacity">
                        ${taskId ? 'Guardar Cambios' : 'Crear Tarea'}
                    </button>
                </div>
            </form>
        `);

        document.getElementById('task-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const labels = formData.getAll('labels');
            const id = taskId || generateUUID();

            const isNew = !taskId;
            board.tasks[id] = {
                id,
                title: formData.get('title'),
                description: formData.get('description') || '',
                dueDate: formData.get('dueDate') || null,
                assigneeId: formData.get('assigneeId') || null,
                labels,
                createdBy: task?.createdBy || state.currentUser?.id,
                createdAt: task?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                history: task?.history || [{ columnId: colId, authorId: state.currentUser?.id, enteredAt: new Date().toISOString() }]
            };

            if (isNew && colId) {
                const col = board.columns.find(c => c.id === colId);
                if (col) col.tasks.push(id);
                this.logActivity('TASK_CREATED', 'task', id, `Creó la tarea "${board.tasks[id].title}" en el tablero "${board.name}"`);
            } else if (!isNew) {
                this.logActivity('TASK_UPDATED', 'task', id, `Actualizó la tarea "${board.tasks[id].title}"`);
            }

            ModalService.hide();
            this.save();
            this.refresh();
        });
    },

    showNewBoardForm() {
        const isMatrix = state.settings.lastView === 'matrices';

        ModalService.show(isMatrix ? '➕ Nueva Matriz' : '➕ Nuevo Tablero', `
            <form id="new-board-form" class="space-y-4">
                <div>
                    <label class="block text-sm font-semibold mb-1 text-[var(--color-text-secondary)]">
                        Nombre ${isMatrix ? 'de la matriz' : 'del tablero'} *
                    </label>
                    <input type="text" name="name" required autofocus
                           placeholder="${isMatrix ? 'ej: Q1 Decisiones Estratégicas' : 'ej: Desarrollo Backend'}"
                           class="w-full p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)]
                                  focus:outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20">
                </div>
                ${!isMatrix ? `
                <div>
                    <label class="block text-sm font-semibold mb-1 text-[var(--color-text-secondary)]">Plantilla</label>
                    <select name="template"
                            class="w-full p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)]">
                        <option value="kanban">Kanban (Por Hacer / En Progreso / Hecho)</option>
                        <option value="agile">Agile (Backlog / Sprint / Review / Done)</option>
                        <option value="simple">Simple (Pendiente / Completado)</option>
                    </select>
                </div>` : ''}
                <div class="flex justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
                    <button type="button" onclick="App.hideModal()"
                            class="px-4 py-2 rounded-xl bg-[var(--color-bg-secondary)] hover:opacity-80">Cancelar</button>
                    <button type="submit"
                            class="px-5 py-2 rounded-xl bg-[var(--primary)] text-white font-semibold hover:opacity-90">
                        Crear
                    </button>
                </div>
            </form>
        `);

        document.getElementById('new-board-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target));

            if (isMatrix) {
                const newId = generateUUID();
                state.matrices.push({
                    id: newId,
                    name: data.name,
                    ownerId: state.currentUser.id,
                    quadrants: { do: [], plan: [], delegate: [], eliminate: [] },
                    createdAt: new Date().toISOString()
                });
                this.logActivity('MATRIX_CREATED', 'matrix', newId, `Creó la nueva matriz "${data.name}"`);
            } else {
                const templates = {
                    kanban: [
                        { name: 'Por Hacer', wipLimit: 0 },
                        { name: 'En Progreso', wipLimit: 3 },
                        { name: 'Hecho', wipLimit: 0 }
                    ],
                    agile: [
                        { name: 'Backlog', wipLimit: 0 },
                        { name: 'Sprint', wipLimit: 5 },
                        { name: 'En Revisión', wipLimit: 2 },
                        { name: 'Hecho', wipLimit: 0 }
                    ],
                    simple: [
                        { name: 'Pendiente', wipLimit: 0 },
                        { name: 'Completado', wipLimit: 0 }
                    ]
                };
                const template = templates[data.template] || templates.kanban;

                const newId = generateUUID();
                state.boards.push({
                    id: newId,
                    name: data.name,
                    ownerId: state.currentUser.id,
                    columns: template.map(t => ({ id: generateUUID(), name: t.name, tasks: [], wipLimit: t.wipLimit })),
                    tasks: {},
                    labels: { ...DEFAULT_LABELS },
                    createdAt: new Date().toISOString()
                });
                this.logActivity('BOARD_CREATED', 'board', newId, `Creó el tablero "${data.name}" con la plantilla "${data.template}"`);
            }

            ModalService.hide();
            this.save();
            this.refresh();
        });
    },

    showExportMatrixDialog(taskId) {
        const board = state.boards.find(b => b.id === state.currentBoardId);
        const task = board?.tasks[taskId];
        if (!task) return;

        // Componer si la tarea ya fue exportada a alguna matriz
        let alreadyExportedTo = null;
        let exportedQuadrant = null;

        for (const m of state.matrices) {
            for (const [qKey, qTasks] of Object.entries(m.quadrants)) {
                if (qTasks.some(t => t.origin?.taskId === taskId)) {
                    alreadyExportedTo = m.name;
                    exportedQuadrant = qKey;
                    break;
                }
            }
            if (alreadyExportedTo) break;
        }

        if (alreadyExportedTo) {
            const quadrantNames = { do: '🔴 Hacer Ahora', plan: '🔵 Planificar', delegate: '🟡 Delegar', eliminate: '⚫ Eliminar' };
            const qName = quadrantNames[exportedQuadrant] || exportedQuadrant;
            ModalService.show('⚠️ Tarea ya exportada', `
                <div class="space-y-4">
                    <p class="text-[var(--color-text-secondary)]">Esta tarea ya fue enviada previamente a una matriz y se encuentra activa allí.</p>
                    <div class="p-4 bg-[var(--color-bg-secondary)] rounded-xl text-sm font-medium border border-[var(--color-border)]">
                        <span class="block text-xs text-[var(--color-text-secondary)] mb-1 uppercase tracking-wider font-bold">Ubicación Actual:</span>
                        <div class="text-[var(--color-text-primary)] text-lg mb-1">${escapeHTML(alreadyExportedTo)}</div>
                        <div class="text-[var(--color-text-secondary)]">${qName}</div>
                    </div>
                    <div class="flex justify-end pt-2">
                        <button type="button" onclick="App.hideModal()" class="px-5 py-2 rounded-xl bg-[var(--primary)] text-white font-semibold hover:opacity-90">Entendido</button>
                    </div>
                </div>
            `);
            return;
        }

        if (state.matrices.length === 0) {
            ModalService.confirm(
                '⚡ Sin Matrices',
                'No tienes matrices creadas. ¿Crear una ahora?',
                () => {
                    state.settings.lastView = 'matrices';
                    this.refresh();
                    this.showNewBoardForm();
                }
            );
            return;
        }

        const matrixOptions = state.matrices.map(m => `<option value="${m.id}">${escapeHTML(m.name)}</option>`).join('');

        ModalService.show('⚡ Enviar a Matriz Eisenhower', `
            <form id="export-form" class="space-y-4">
                <div class="p-3 bg-[var(--color-bg-secondary)] rounded-xl text-sm font-medium">
                    📌 "${escapeHTML(task.title)}"
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-1 text-[var(--color-text-secondary)]">Seleccionar Matriz</label>
                    <select name="matrixId" class="w-full p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)]">
                        ${matrixOptions}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-2 text-[var(--color-text-secondary)]">Cuadrante</label>
                    <div class="grid grid-cols-2 gap-2">
                        <label class="flex items-center gap-2 p-3 bg-red-50 border-2 border-transparent rounded-xl cursor-pointer hover:border-red-300 has-[:checked]:border-red-500">
                            <input type="radio" name="quadrant" value="do" checked class="accent-red-500">
                            <span class="text-sm font-medium">🔴 Hacer Ahora</span>
                        </label>
                        <label class="flex items-center gap-2 p-3 bg-blue-50 border-2 border-transparent rounded-xl cursor-pointer hover:border-blue-300 has-[:checked]:border-blue-500">
                            <input type="radio" name="quadrant" value="plan" class="accent-blue-500">
                            <span class="text-sm font-medium">🔵 Planificar</span>
                        </label>
                        <label class="flex items-center gap-2 p-3 bg-amber-50 border-2 border-transparent rounded-xl cursor-pointer hover:border-amber-300 has-[:checked]:border-amber-500">
                            <input type="radio" name="quadrant" value="delegate" class="accent-amber-500">
                            <span class="text-sm font-medium">🟡 Delegar</span>
                        </label>
                        <label class="flex items-center gap-2 p-3 bg-slate-50 border-2 border-transparent rounded-xl cursor-pointer hover:border-slate-300 has-[:checked]:border-slate-500">
                            <input type="radio" name="quadrant" value="eliminate" class="accent-slate-500">
                            <span class="text-sm font-medium">⚫ Eliminar</span>
                        </label>
                    </div>
                </div>
                <div class="flex justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
                    <button type="button" onclick="App.hideModal()" class="px-4 py-2 rounded-xl bg-[var(--color-bg-secondary)] hover:opacity-80">Cancelar</button>
                    <button type="submit" class="px-5 py-2 rounded-xl bg-[var(--primary)] text-white font-semibold hover:opacity-90">⚡ Enviar</button>
                </div>
            </form>
        `);

        document.getElementById('export-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target));
            const matrix = state.matrices.find(m => m.id === data.matrixId);
            if (!matrix) return;

            matrix.quadrants[data.quadrant].push({
                id: generateUUID(),
                title: task.title,
                description: task.description || '',
                completed: false,
                exportedBy: state.currentUser?.id,
                exportedAt: new Date().toISOString(),
                origin: { boardId: board.id, boardName: board.name, taskId }
            });

            this.logActivity('EXPORTED_TO_MATRIX', 'task', taskId, `Envió la tarea "${task.title}" al cuadrante de matriz`);


            ModalService.hide();
            this.save();
            showToast(`⚡ "${task.title}" enviada al cuadrante`);
        });
    },

    showCompleteMatrixTaskDialog(matrixId, quadrant, task, board) {
        // Obtenemos las columnas del tablero para seleccionar el destino
        const columnOptions = board.columns.map(col =>
            // Pre-seleccionamos la última columna (que usualmente es "Hecho")
            `<option value="${col.id}" ${board.columns[board.columns.length - 1].id === col.id ? 'selected' : ''}>${escapeHTML(col.name)}</option>`
        ).join('');

        ModalService.show('Completar Tarea Vinculada', `
            <form id="complete-matrix-form" class="space-y-4">
                <p class="text-[var(--color-text-secondary)] text-sm mb-4">
                    Has marcado como finalizada una tarea vinculada al tablero original. ¿Deseas moverla automáticamente a una columna de conclusión?
                </p>
                <div class="p-3 bg-[var(--color-bg-secondary)] rounded-xl text-sm font-medium mb-4">
                    📋 ${escapeHTML(board.name)} > "${escapeHTML(task.title)}"
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-1 text-[var(--color-text-secondary)]">Mover a la columna:</label>
                    <select name="targetColId" class="w-full p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)]">
                        ${columnOptions}
                    </select>
                </div>
                <div class="flex justify-end gap-3 pt-4 border-t border-[var(--color-border)] mt-4">
                    <button type="button" onclick="App.hideModal()" class="px-4 py-2 rounded-xl bg-[var(--color-bg-secondary)] hover:opacity-80">Cancelar</button>
                    <button type="submit" class="px-5 py-2 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 transition-colors">✅ Confirmar Movimiento</button>
                </div>
            </form>
        `);

        document.getElementById('complete-matrix-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target));

            // 1. Marcar la tarea en la matriz como completada
            task.completed = true;

            // 2. Mover la tarea en el tablero a la columna seleccionada
            const targetColId = data.targetColId;
            const originalTask = board.tasks[task.origin.taskId];

            if (originalTask && targetColId) {
                // Remover de columnas anteriores
                board.columns.forEach(c => {
                    c.tasks = c.tasks.filter(id => id !== originalTask.id);
                });

                // Añadir a nueva columna
                const targetCol = board.columns.find(c => c.id === targetColId);
                if (targetCol) {
                    targetCol.tasks.push(originalTask.id);
                    // Actualizar historial de la tarea
                    if (!originalTask.history) originalTask.history = [];
                    originalTask.history.push({
                        columnId: targetColId,
                        columnName: targetCol.name,
                        authorId: state.currentUser?.id,
                        enteredAt: new Date().toISOString()
                    });
                    originalTask.updatedAt = new Date().toISOString();
                }
                this.logActivity('TASK_COMPLETED_VIA_MATRIX', 'task', originalTask.id, `Completó la tarea "${originalTask.title}" desde la Matriz Eisenhower`);
            }

            ModalService.hide();
            this.save();
            this.refresh();
            showToast('✅ Tarea completada y archivada');
        });
    },

    showAddMatrixTaskForm(matrixId, quadrant) {
        ModalService.show('➕ Añadir Tarea a Matriz', `
            <form id="matrix-task-form" class="space-y-4">
                <div>
                    <label class="block text-sm font-semibold mb-1">Título *</label>
                    <input type="text" name="title" required autofocus placeholder="¿Qué hay que decidir?"
                           class="w-full p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)]
                                  focus:outline-none focus:border-[var(--primary)]">
                </div>
                <div class="flex justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
                    <button type="button" onclick="App.hideModal()" class="px-4 py-2 rounded-xl bg-[var(--color-bg-secondary)] hover:opacity-80">Cancelar</button>
                    <button type="submit" class="px-5 py-2 rounded-xl bg-[var(--primary)] text-white font-semibold hover:opacity-90">Añadir</button>
                </div>
            </form>
        `);

        document.getElementById('matrix-task-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const matrix = state.matrices.find(m => m.id === matrixId);
            if (!matrix) return;
            const title = new FormData(e.target).get('title');
            matrix.quadrants[quadrant].push({
                id: generateUUID(),
                title,
                completed: false,
                createdAt: new Date().toISOString()
            });
            ModalService.hide();
            this.save();
            this.refresh();
        });
    },

    showProfileMenu() {
        if (!state.currentUser) return;
        const canManage = PermissionsService.can('manage_users');

        ModalService.show('👤 Mi Perfil', `
            <form id="profile-form" class="space-y-4">
                <div class="flex items-center gap-4 mb-4">
                    <div class="text-5xl">${state.currentUser.avatar}</div>
                    <div>
                        <p class="font-bold text-lg">${escapeHTML(state.currentUser.name)}</p>
                        <span class="text-xs bg-[var(--color-bg-secondary)] px-2 py-1 rounded-full font-semibold uppercase">
                            ${state.currentUser.role}
                        </span>
                    </div>
                </div>
                ${state.currentUser.role !== 'viewer' ? `
                <div>
                    <label class="block text-sm font-semibold mb-1">Nombre de pantalla</label>
                    <input type="text" name="name" value="${escapeHTML(state.currentUser.name)}"
                           class="w-full p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)] focus:outline-none focus:border-[var(--primary)]">
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-1">Contraseña</label>
                    <input type="password" name="password" value="${state.currentUser.password || ''}"
                           class="w-full p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)] focus:outline-none focus:border-[var(--primary)] text-center tracking-widest">
                </div>
                <div>
                    <label class="block text-sm font-semibold mb-1">Avatar (emoji)</label>
                    <input type="text" name="avatar" value="${state.currentUser.avatar}"
                           class="w-full p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)] text-center text-2xl">
                </div>
                ` : '<p class="text-sm text-[var(--color-text-secondary)]">Modo invitado — sin edición.</p>'}
                <div class="flex flex-wrap gap-2 pt-4 border-t border-[var(--color-border)]">
                    ${state.currentUser.role !== 'viewer' ? `
                    <button type="submit" class="px-4 py-2 rounded-xl bg-[var(--primary)] text-white font-semibold hover:opacity-90 flex-1">
                        Guardar Cambios
                    </button>` : ''}
                    ${canManage ? `
                    <button type="button" onclick="App.showUserManagement();"
                            class="px-4 py-2 rounded-xl border border-[var(--color-border)] hover:opacity-80 text-sm">
                        👥 Gestionar Usuarios
                    </button>` : ''}
                    <button type="button" onclick="App.logout();"
                            class="px-4 py-2 rounded-xl bg-red-100 text-red-700 hover:bg-red-200 text-sm font-semibold">
                        🚪 Cerrar sesión
                    </button>
                </div>
            </form>
        `);

        document.getElementById('profile-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target));
            AuthService.updateProfile(state.currentUser.id, {
                name: data.name,
                avatar: data.avatar,
                password: data.password
            });
            ModalService.hide();
            this.updateUserNav();
            this.save();
            showToast('✅ Perfil actualizado');
        });
    },

    showUserManagement() {
        ModalService.show('👥 Gestión de Usuarios', `
            <div class="space-y-3 max-h-96 overflow-y-auto">
                ${state.users.map(u => `
                    <div class="flex items-center gap-3 p-3 bg-[var(--color-bg-secondary)] rounded-xl">
                        <span class="text-2xl">${u.avatar}</span>
                        <div class="flex-1 min-w-0">
                            <p class="font-semibold truncate">${escapeHTML(u.name)}</p>
                            <p class="text-xs text-[var(--color-text-secondary)] uppercase">${u.role}</p>
                        </div>
                        ${state.currentUser.id !== u.id ? `
                        <button onclick="App.deleteUser('${u.id}')"
                                class="p-2 text-red-400 hover:bg-red-50 rounded-lg text-sm hover:text-red-600">🗑️</button>
                        ` : '<span class="text-xs text-blue-500 font-medium">Tú</span>'}
                    </div>
                `).join('')}
            </div>
            <div class="pt-4 border-t border-[var(--color-border)] mt-4">
                <button onclick="App.showCreateUserForm()" class="w-full p-3 bg-[var(--primary)] text-white rounded-xl font-semibold hover:opacity-90">
                    ➕ Crear Nuevo Usuario
                </button>
            </div>
        `);
    },

    showCreateUserForm() {
        ModalService.show('➕ Crear Usuario', `
            <form id="create-user-form" class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-semibold mb-1">Nombre *</label>
                        <input type="text" name="name" required
                               class="w-full p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)] focus:outline-none focus:border-[var(--primary)]">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-1">Avatar (emoji)</label>
                        <input type="text" name="avatar" value="🧑" class="w-full p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)] text-center text-2xl">
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-semibold mb-1">Contraseña *</label>
                        <input type="text" name="password" required
                               class="w-full p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)] focus:outline-none focus:border-[var(--primary)]">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold mb-1">Rol</label>
                        <select name="role" class="w-full p-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)]">
                            <option value="member">👨‍💻 Miembro</option>
                            <option value="viewer">👀 Invitado</option>
                            <option value="admin">👑 Administrador</option>
                        </select>
                    </div>
                </div>
                <div class="flex justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
                    <button type="button" onclick="App.showUserManagement()" class="px-4 py-2 rounded-xl bg-[var(--color-bg-secondary)] hover:opacity-80">← Volver</button>
                    <button type="submit" class="px-5 py-2 rounded-xl bg-[var(--primary)] text-white font-semibold hover:opacity-90">Crear</button>
                </div>
            </form>
        `);

        document.getElementById('create-user-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target));
            AuthService.createUser(data);
            ModalService.hide();
            this.save();
            showToast(`✅ Usuario "${data.name}" creado`);
        });
    },

    deleteUser(userId) {
        const user = state.users.find(u => u.id === userId);
        if (!user) return;
        ModalService.confirm(`Eliminar usuario`, `¿Eliminar a "${user.name}"? Esta acción no se puede deshacer.`, () => {
            state.users = state.users.filter(u => u.id !== userId);
            this.save();
            this.showUserManagement();
        });
    },

    // =============================================================
    // GESTIÓN DE ETIQUETAS DEL TABLERO
    // =============================================================
    showManageLabels() {
        const board = state.boards.find(b => b.id === state.currentBoardId);
        if (!board) return;
        const labels = board.labels || {};

        const renderLabelsHTML = () => Object.entries(labels).map(([name, colorClass]) => `
            <div class="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
                <div class="flex items-center gap-2">
                    <span class="px-3 py-1 rounded-full text-xs font-semibold ${escapeHTML(colorClass)}">${escapeHTML(name)}</span>
                </div>
                <button onclick="App.deleteLabelFromBoard('${escapeHTML(name)}')"
                        class="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 text-xs font-medium">Eliminar</button>
            </div>
        `).join('');

        const buildModal = () => `
            <div class="space-y-4">
                <div class="max-h-48 overflow-y-auto" id="labels-list">
                    ${renderLabelsHTML() || '<p class="text-sm text-[var(--color-text-secondary)] py-2">No hay etiquetas aún.</p>'}
                </div>
                <div class="border-t border-[var(--color-border)] pt-4">
                    <p class="text-sm font-semibold mb-3 text-[var(--color-text-primary)]">Añadir nueva etiqueta</p>
                    <form id="add-label-form" class="space-y-3">
                        <input type="text" name="labelName" placeholder="Nombre de la etiqueta (ej: Urgente)"
                               required class="w-full p-2.5 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)] text-sm focus:outline-none focus:border-[var(--primary)]">
                        <div class="grid grid-cols-3 gap-2">
                            <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="color" value="bg-red-100 text-red-800" checked><span class="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-medium">Rojo</span></label>
                            <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="color" value="bg-blue-100 text-blue-800"><span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">Azul</span></label>
                            <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="color" value="bg-green-100 text-green-800"><span class="px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs font-medium">Verde</span></label>
                            <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="color" value="bg-yellow-100 text-yellow-800"><span class="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium">Amarillo</span></label>
                            <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="color" value="bg-purple-100 text-purple-800"><span class="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-xs font-medium">Violeta</span></label>
                            <label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="color" value="bg-gray-100 text-gray-800"><span class="px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 text-xs font-medium">Gris</span></label>
                        </div>
                        <div class="flex justify-end gap-2">
                            <button type="button" onclick="App.hideModal()" class="px-4 py-2 rounded-xl bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] text-sm hover:opacity-80">Cerrar</button>
                            <button type="submit" class="px-5 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold hover:opacity-90">Añadir</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        ModalService.show('🏷️ Gestionar Etiquetas', buildModal());

        document.getElementById('add-label-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target));
            const name = data.labelName?.trim();
            if (!name) return;
            if (!board.labels) board.labels = {};
            board.labels[name] = data.color;
            this.save();
            // Refresh modal content
            const listEl = document.getElementById('labels-list');
            if (listEl) listEl.innerHTML = renderLabelsHTML() || '<p class="text-sm text-[var(--color-text-secondary)] py-2">No hay etiquetas aún.</p>';
            e.target.reset();
            showToast(`✅ Etiqueta "${name}" creada`);
        });
    },

    deleteLabelFromBoard(labelName) {
        const board = state.boards.find(b => b.id === state.currentBoardId);
        if (!board || !board.labels) return;
        delete board.labels[labelName];
        // Remove label from all tasks in this board
        Object.values(board.tasks || {}).forEach(task => {
            if (task.labels) task.labels = task.labels.filter(l => l !== labelName);
        });
        this.save();
        // Refresh modal list
        const listEl = document.getElementById('labels-list');
        const renderLabelsHTML = () => Object.entries(board.labels || {}).map(([name, colorClass]) => `
            <div class="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
                <span class="px-3 py-1 rounded-full text-xs font-semibold ${escapeHTML(colorClass)}">${escapeHTML(name)}</span>
                <button onclick="App.deleteLabelFromBoard('${escapeHTML(name)}')"
                        class="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 text-xs font-medium">Eliminar</button>
            </div>
        `).join('');
        if (listEl) listEl.innerHTML = renderLabelsHTML() || '<p class="text-sm text-[var(--color-text-secondary)] py-2">No hay etiquetas aún.</p>';
        showToast(`🗑️ Etiqueta eliminada`);
    },

    // =============================================================
    // GESTIÓN DE MIEMBROS
    // =============================================================
    showManageMembers() {
        const membersHTML = () => state.members.map(m => `
            <div class="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
                <div class="flex items-center gap-3">
                    <span class="w-8 h-8 rounded-full ${m.color || 'bg-blue-500'} text-white flex items-center justify-center text-xs font-bold">
                        ${m.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                    </span>
                    <div>
                        <p class="text-sm font-semibold text-[var(--color-text-primary)]">${escapeHTML(m.name)}</p>
                        <p class="text-xs text-[var(--color-text-secondary)]">${escapeHTML(m.role || 'Miembro')}</p>
                    </div>
                </div>
                <button onclick="App.removeMember('${m.id}')"
                        class="text-red-500 hover:text-red-700 text-xs font-medium px-2 py-1 rounded hover:bg-red-50">Quitar</button>
            </div>
        `).join('');

        const buildMembersContent = () => `
            <div class="space-y-4">
                <div class="max-h-48 overflow-y-auto" id="members-list">
                    ${membersHTML() || '<p class="text-sm text-[var(--color-text-secondary)] py-2">No hay miembros.</p>'}
                </div>
                <div class="border-t border-[var(--color-border)] pt-4">
                    <p class="text-sm font-semibold mb-3 text-[var(--color-text-primary)]">Añadir miembro al equipo</p>
                    <form id="add-member-form" class="space-y-3">
                        <input type="text" name="memberName" placeholder="Nombre completo" required
                               class="w-full p-2.5 border border-[var(--color-border)] rounded-xl bg-[var(--color-bg-primary)] text-sm focus:outline-none focus:border-[var(--primary)]">
                        <div class="grid grid-cols-4 gap-2">
                            ${['bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-rose-500', 'bg-amber-500', 'bg-teal-500', 'bg-indigo-500', 'bg-pink-500'].map(c =>
            `<label class="cursor-pointer"><input type="radio" name="color" value="${c}" class="sr-only"><span class="block w-8 h-8 rounded-full ${c} mx-auto ring-offset-1 peer-checked:ring-2 hover:ring-2 hover:ring-[var(--primary)] transition-all"></span></label>`
        ).join('')}
                        </div>
                        <div class="flex justify-end gap-2">
                            <button type="button" onclick="App.hideModal()" class="px-4 py-2 rounded-xl bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] text-sm">Cerrar</button>
                            <button type="submit" class="px-5 py-2 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold">Añadir</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        ModalService.show('👥 Gestionar Miembros', buildMembersContent());

        document.getElementById('add-member-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target));
            const name = data.memberName?.trim();
            if (!name) return;
            const newMember = { id: generateUUID(), name, color: data.color || 'bg-blue-500', role: 'Miembro' };
            if (!state.members) state.members = [];
            state.members.push(newMember);
            this.save();
            // Refresh list
            const listEl = document.getElementById('members-list');
            if (listEl) listEl.innerHTML = membersHTML();
            e.target.reset();
            showToast(`✅ Miembro "${name}" añadido`);
        });
    },

    removeMember(memberId) {
        const member = state.members?.find(m => m.id === memberId);
        if (!member) return;
        ModalService.confirm('Quitar miembro', `¿Quitar a "${member.name}" del equipo?`, () => {
            state.members = state.members.filter(m => m.id !== memberId);
            this.save();
            this.showManageMembers();
        });
    },

    // =============================================================
    // PERSISTENCIA
    // =============================================================
    save(syncToCloud = true) {
        StateManager.save();
        if (syncToCloud && SyncService.enabled) {
            SyncService.push(state, state.currentUser?.id).catch(() => { });
        }
    },

    // =============================================================
    // EVENTOS GLOBALES
    // =============================================================
    bindGlobalEvents() {
        // Navegar con pestañas
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                state.currentBoardId = null;
                state.currentMatrixId = null;
                state.settings.lastView = tab.dataset.view;
                this.refresh();
            });
        });

        // Botones "Nuevo..."
        document.getElementById('new-board-btn')?.addEventListener('click', () => this.showNewBoardForm());
        document.getElementById('new-matrix-btn')?.addEventListener('click', () => this.showNewBoardForm());

        // Volver atrás desde detalle de tablero
        document.getElementById('back-to-boards-btn')?.addEventListener('click', () => {
            state.currentBoardId = null;
            this.refresh();
        });

        // Volver atrás desde detalle de matriz
        document.getElementById('back-to-matrices-btn')?.addEventListener('click', () => {
            state.currentMatrixId = null;
            this.refresh();
        });

        // Botón añadir columna (en board header)
        document.addEventListener('click', (e) => {
            const addColBtn = e.target.closest('#add-column-btn');
            if (addColBtn) this.getHandlers().onAddColumn();

            const labelsBtn = e.target.closest('#manage-labels-btn');
            if (labelsBtn) this.showManageLabels();

            const membersBtn = e.target.closest('#manage-members-btn');
            if (membersBtn) this.showManageMembers();
        });

        // Cerrar modal al hacer click en overlay
        document.getElementById('modal-container')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) ModalService.hide();
        });

        // Cerrar modal con botón cerrar
        document.getElementById('modal-close-btn')?.addEventListener('click', () => ModalService.hide());

        // Cerrar modal con ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') ModalService.hide();
        });

        // Selector de tema
        this.bindThemeSelector();

        // Filtros de búsqueda
        this.bindFilters();
    },

    bindThemeSelector() {
        const themeBtn = document.getElementById('theme-selector-btn');
        const themeMenu = document.getElementById('theme-menu');
        if (!themeBtn || !themeMenu) return;

        themeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            themeMenu.classList.toggle('hidden');
        });

        themeMenu.querySelectorAll('[data-theme-value]').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.preventDefault();
                const theme = opt.dataset.themeValue;
                if (state.currentUser) {
                    state.currentUser.theme = theme;
                    const u = state.users.find(user => user.id === state.currentUser.id);
                    if (u) u.theme = theme;
                } else {
                    state.settings.theme = theme;
                }
                this.applyTheme();
                this.save();
                themeMenu.classList.add('hidden');
                showToast(`🎨 Tema "${theme}" aplicado`);
            });
        });

        document.addEventListener('click', (e) => {
            if (!themeBtn.contains(e.target)) themeMenu.classList.add('hidden');
        });
    },

    bindFilters() {
        const searchInput = document.getElementById('task-search-input');
        const labelFilter = document.getElementById('label-filter-select');
        const memberFilter = document.getElementById('member-filter-select');

        const applyFilters = () => {
            const query = searchInput?.value.toLowerCase() || '';
            const label = labelFilter?.value || '';
            const memberId = memberFilter?.value || '';

            document.querySelectorAll('.task-card').forEach(card => {
                const taskId = card.dataset.taskId;
                const board = state.boards.find(b => b.id === state.currentBoardId);
                const task = board?.tasks[taskId];
                if (!task) return;

                const matchesSearch = !query || task.title.toLowerCase().includes(query);
                const matchesLabel = !label || (task.labels || []).includes(label);
                const matchesMember = !memberId || task.assigneeId === memberId;

                card.style.display = (matchesSearch && matchesLabel && matchesMember) ? '' : 'none';
            });
        };

        searchInput?.addEventListener('input', applyFilters);
        labelFilter?.addEventListener('change', applyFilters);
        memberFilter?.addEventListener('change', applyFilters);
    },

    hideModal() {
        ModalService.hide();
    }
};

// Exponer al scope global para que los onclick en JSX funcionen
window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
