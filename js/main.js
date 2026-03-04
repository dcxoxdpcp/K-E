/**
 * js/main.js - Orquestador Principal de la Aplicación (Versión Final)
 */

import { state, StorageProvider, DEFAULT_USERS, generateUUID, ActivityLogger, DEFAULT_LABELS } from './store/state.js';
import { SyncService } from './services/sync.js';
import { AuthService, PermissionsService } from './services/auth.js';
import { ModalService } from './ui/modals.js';
import { PageRenderers } from './ui/pages.js';
import { showToast, escapeHTML } from './ui/utils.js';

const DOM = {
    get taskSearch() { return document.getElementById('task-search-input'); },
    get labelFilter() { return document.getElementById('label-filter-select'); },
    get memberFilter() { return document.getElementById('member-filter-select'); }
};

const App = {
    async init() {
        console.log("⚙️ Eisenhower Agile: Iniciando...");

        // 1. Cargar estado local
        const saved = StorageProvider.load();
        if (saved) {
            // Merge cuidadoso para no perder funciones base
            Object.assign(state, saved);
        }

        // 2. Interfaz de Login o Inicio
        if (!state.currentUser) {
            this.showLoginScreen();
        } else {
            await this.startApp();
        }

        this.bindGlobalEvents();
    },

    showLoginScreen() {
        document.getElementById('login-container').classList.remove('hidden');
        document.getElementById('app').classList.add('hidden');

        const grid = document.getElementById('user-select-grid');
        grid.innerHTML = state.users.map(user => `
            <div data-user-id="${user.id}" class="user-card cursor-pointer bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md hover:shadow-xl transition-all text-center border-2 border-transparent hover:border-blue-500">
                <div class="text-4xl mb-4">${escapeHTML(user.avatar || '👤')}</div>
                <h3 class="font-bold text-lg">${escapeHTML(user.name)}</h3>
                <span class="text-xs text-gray-500 uppercase tracking-widest font-bold">${user.role}</span>
            </div>
        `).join('');

        grid.querySelectorAll('.user-card').forEach(card => {
            card.onclick = () => this.handleLogin(card.dataset.userId);
        });
    },

    async handleLogin(userId) {
        const user = state.users.find(u => u.id === userId);
        // Prompt simplificado para este entorno
        const result = AuthService.login(userId, user.password);
        if (result.success) {
            document.getElementById('login-container').classList.add('hidden');
            document.getElementById('app').classList.remove('hidden');
            await this.startApp();
        }
    },

    async startApp() {
        // Inicializar Sync
        await SyncService.init();
        SyncService.trackPresence(state.currentUser, (p) => PageRenderers.renderPresence(p));

        SyncService.onUpdate((newState) => {
            // Evitar pisar navegación local
            const local = {
                bid: state.currentBoardId,
                mid: state.currentMatrixId,
                view: state.settings.lastView
            };
            Object.assign(state, newState);
            state.currentBoardId = local.bid;
            state.currentMatrixId = local.mid;
            state.settings.lastView = local.view;

            this.refreshCurrentView();
            showToast("🔄 Cambios recibidos");
        });

        // Configuración inicial de UI
        this.updateUserDisplay();
        this.refreshCurrentView();
    },

    updateUserDisplay() {
        const display = document.getElementById('current-user-display');
        if (display && state.currentUser) {
            display.innerHTML = `
                <div class="flex items-center gap-3 px-4 py-1.5 bg-gray-100 dark:bg-slate-800 rounded-full border border-gray-200 dark:border-slate-700 shadow-sm cursor-pointer hover:bg-white transition-colors">
                    <span class="text-xl">${state.currentUser.avatar}</span>
                    <div class="flex flex-col">
                        <span class="text-sm font-bold leading-none">${state.currentUser.name}</span>
                        <span class="text-[9px] uppercase text-gray-400 font-extrabold tracking-tighter">${state.currentUser.role}</span>
                    </div>
                </div>
            `;
            display.onclick = () => this.showProfileModal();
        }
    },

    refreshCurrentView() {
        const view = state.settings.lastView || 'boards';
        PageRenderers.showView(view);

        if (view === 'boards') {
            if (state.currentBoardId) {
                PageRenderers.renderBoard(state.currentBoardId, this.getBoardHandlers());
                this.initSortable();
            } else {
                PageRenderers.renderBoardsGallery(this.getGalleryHandlers());
            }
        } else if (view === 'matrices') {
            if (state.currentMatrixId) {
                PageRenderers.renderMatrix(state.currentMatrixId, this.getMatrixHandlers());
            } else {
                // PageRenderers.renderMatricesGallery(this.getMatrixGalleryHandlers());
            }
        }
    },

    getGalleryHandlers() {
        return {
            onOpen: (id) => {
                state.currentBoardId = id;
                this.refreshCurrentView();
            },
            onDelete: (id) => {
                ModalService.confirm("Eliminar Tablero", "¿Estás seguro de que deseas eliminar este tablero permanentemente?", () => {
                    ActivityLogger.log('delete_board', state.boards.find(b => b.id === id)?.name, 'Eliminado');
                    state.boards = state.boards.filter(b => b.id !== id);
                    this.save();
                    this.refreshCurrentView();
                });
            }
        };
    },

    getBoardHandlers() {
        return {
            onAddTask: (colId) => this.showTaskModal(null, colId),
            onEdit: (taskId) => this.showTaskModal(taskId),
            onDelete: (taskId) => {
                const board = state.boards.find(b => b.id === state.currentBoardId);
                const task = board.tasks[taskId];
                ModalService.confirm("Eliminar Tarea", `¿Eliminar "${task.title}"?`, () => {
                    delete board.tasks[taskId];
                    board.columns.forEach(c => c.tasks = c.tasks.filter(id => id !== taskId));
                    ActivityLogger.log('delete_task', task.title, 'Eliminada');
                    this.save();
                    this.refreshCurrentView();
                });
            }
        };
    },

    showTaskModal(taskId = null, columnId = null) {
        const board = state.boards.find(b => b.id === state.currentBoardId);
        const task = taskId ? board.tasks[taskId] : null;

        const fields = [
            { name: 'title', label: 'Título', value: task?.title || '', required: true },
            { name: 'description', label: 'Descripción', type: 'textarea', value: task?.description || '' },
            { name: 'dueDate', label: 'Vencimiento', type: 'date', value: task?.dueDate || '' },
            {
                name: 'assigneeId',
                label: 'Asignar a',
                type: 'select',
                options: state.members.map(m => ({ value: m.id, label: m.name })),
                value: task?.assigneeId || ''
            }
        ];

        ModalService.show(task ? 'Editar Tarea' : 'Nueva Tarea', `
            <form id="task-modal-form" class="space-y-4">
                ${fields.map(f => `
                    <div>
                        <label class="block text-sm font-bold text-gray-500 mb-1">${f.label}</label>
                        ${f.type === 'textarea' ?
                `<textarea name="${f.name}" class="w-full rounded-lg border-gray-300 dark:bg-slate-800">${f.value}</textarea>` :
                f.type === 'select' ?
                    `<select name="${f.name}" class="w-full rounded-lg border-gray-300 dark:bg-slate-800">
                                <option value="">Sin asignar</option>
                                ${f.options.map(opt => `<option value="${opt.value}" ${opt.value === f.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
                            </select>` :
                    `<input type="${f.type || 'text'}" name="${f.name}" value="${f.value}" class="w-full rounded-lg border-gray-300 dark:bg-slate-800" ${f.required ? 'required' : ''}>`
            }
                    </div>
                `).join('')}
                <div class="flex justify-end gap-2 pt-4">
                    <button type="button" class="px-6 py-2 rounded-lg bg-gray-100 hover:bg-gray-200" onclick="App.hideModal()">Cancelar</button>
                    <button type="submit" class="btn-action">Guardar</button>
                </div>
            </form>
        `);

        document.getElementById('task-modal-form').onsubmit = (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target));

            const newTask = {
                id: taskId || generateUUID(),
                ...data,
                labels: task?.labels || [],
                createdAt: task?.createdAt || new Date().toISOString()
            };

            board.tasks[newTask.id] = newTask;
            if (!taskId) {
                const column = board.columns.find(c => c.id === columnId);
                column.tasks.push(newTask.id);
                ActivityLogger.log('create_task', newTask.title, 'Creada');
            } else {
                ActivityLogger.log('edit_task', newTask.title, 'Editada');
            }

            this.save();
            ModalService.hide();
            this.refreshCurrentView();
        };
    },

    save() {
        StorageProvider.save(state);
        SyncService.push(state, state.currentUser.id);
    },

    initSortable() {
        // Implementar SortableJS para las columnas de tareas
        document.querySelectorAll('.tasks-container').forEach(el => {
            new Sortable(el, {
                group: 'tasks',
                animation: 150,
                onEnd: (evt) => {
                    const board = state.boards.find(b => b.id === state.currentBoardId);
                    const fromColId = evt.from.closest('.column').dataset.columnId;
                    const toColId = evt.to.closest('.column').dataset.columnId;
                    const taskId = evt.item.dataset.taskId;

                    const fromCol = board.columns.find(c => c.id === fromColId);
                    const toCol = board.columns.find(c => c.id === toColId);

                    fromCol.tasks.splice(evt.oldIndex, 1);
                    toCol.tasks.splice(evt.newIndex, 0, taskId);

                    ActivityLogger.log('move_task', board.tasks[taskId].title, `Movida a ${toCol.name}`);
                    this.save();
                }
            });
        });
    },

    bindGlobalEvents() {
        // Navegación
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.onclick = () => {
                state.currentBoardId = null;
                state.currentMatrixId = null;
                state.settings.lastView = tab.dataset.view;
                this.refreshCurrentView();
            };
        });

        // Logo
        document.getElementById('app-logo').onclick = () => {
            state.currentBoardId = null;
            state.settings.lastView = 'boards';
            this.refreshCurrentView();
        };

        // Volver
        document.getElementById('back-to-boards-btn').onclick = () => {
            state.currentBoardId = null;
            this.refreshCurrentView();
        };

        // Nuevo Tablero
        document.getElementById('new-board-btn').onclick = () => {
            const name = prompt("Nombre del tablero:");
            if (name) {
                const newBoard = {
                    id: generateUUID(),
                    name,
                    columns: [
                        { id: generateUUID(), name: 'Pendiente', tasks: [] },
                        { id: generateUUID(), name: 'En Proceso', tasks: [] },
                        { id: generateUUID(), name: 'Hecho', tasks: [] }
                    ],
                    tasks: {},
                    labels: { ...DEFAULT_LABELS }
                };
                state.boards.push(newBoard);
                ActivityLogger.log('create_board', name, 'Creado');
                this.save();
                this.refreshCurrentView();
            }
        };

        // Filtros
        if (DOM.taskSearch) DOM.taskSearch.oninput = () => this.refreshCurrentView();
        if (DOM.labelFilter) DOM.labelFilter.onchange = () => this.refreshCurrentView();
        if (DOM.memberFilter) DOM.memberFilter.onchange = () => this.refreshCurrentView();
    },

    hideModal() { ModalService.hide(); }
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
