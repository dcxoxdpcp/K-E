/**
 * js/ui/modals.js - Gestión de Modales
 */

import { escapeHTML } from './utils.js';

const DOM = {
    container: document.getElementById('modal-container'),
    content: document.getElementById('modal-content'),
    title: document.getElementById('modal-title'),
    body: document.getElementById('modal-body'),
    main: document.getElementById('main-content')
};

export const ModalService = {
    show(title, bodyHtml) {
        DOM.title.textContent = title;
        DOM.body.innerHTML = bodyHtml;
        DOM.container.classList.remove('hidden');
        DOM.container.classList.add('flex');
        void DOM.content.offsetWidth;
        DOM.content.classList.remove('scale-95', 'opacity-0');
        DOM.content.classList.add('scale-100', 'opacity-100');
        const focusable = DOM.content.querySelectorAll('button, input, select, textarea');
        if (focusable.length > 0) focusable[0].focus();
    },

    hide() {
        DOM.content.classList.remove('scale-100', 'opacity-100');
        DOM.content.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            DOM.container.classList.add('hidden');
            DOM.container.classList.remove('flex');
            DOM.body.innerHTML = '';
        }, 200);
    },

    confirm(title, message, onConfirm, onCancel = () => { }, confirmText = 'Aceptar', cancelText = 'Cancelar') {
        this.show(title, `
            <div class="space-y-4">
                <p class="text-[var(--color-text-secondary)]">${escapeHTML(message)}</p>
                <div class="mt-6 flex justify-end gap-3">
                    <button id="modal-cancel-btn" class="btn-action btn-secondary py-2 px-4">${escapeHTML(cancelText)}</button>
                    <button id="modal-confirm-btn" class="btn-action py-2 px-6">${escapeHTML(confirmText)}</button>
                </div>
            </div>
        `);
        document.getElementById('modal-confirm-btn').onclick = () => { onConfirm(); this.hide(); };
        document.getElementById('modal-cancel-btn').onclick = () => { onCancel(); this.hide(); };
    }
};
