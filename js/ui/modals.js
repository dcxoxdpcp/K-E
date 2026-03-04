/**
 * js/ui/modals.js - Gestión de Modales
 */

import { escapeHTML } from './utils.js';

const DOM = {
    get container() { return document.getElementById('modal-container'); },
    get content() { return document.getElementById('modal-content'); },
    get title() { return document.getElementById('modal-title'); },
    get body() { return document.getElementById('modal-body'); }
};

export const ModalService = {
    show(title, bodyHtml) {
        if (!DOM.container || !DOM.content) return;

        DOM.title.textContent = title;
        DOM.body.innerHTML = bodyHtml;

        DOM.container.classList.remove('hidden');
        DOM.container.classList.add('flex');

        // Trigger reflow for animation
        void DOM.content.offsetWidth;

        DOM.content.classList.remove('scale-95', 'opacity-0');
        DOM.content.classList.add('scale-100', 'opacity-100');

        const focusable = DOM.content.querySelectorAll('button, input, select, textarea');
        if (focusable.length > 0) focusable[0].focus();
    },

    hide() {
        if (!DOM.container || !DOM.content) return;

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
                    <button id="modal-cancel-btn" class="px-4 py-2 rounded-xl bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] font-medium hover:opacity-80">${escapeHTML(cancelText)}</button>
                    <button id="modal-confirm-btn" class="px-6 py-2 rounded-xl bg-red-500 text-white hover:bg-red-600 font-bold transition-colors">${escapeHTML(confirmText)}</button>
                </div>
            </div>
        `);

        const cBtn = document.getElementById('modal-confirm-btn');
        const xBtn = document.getElementById('modal-cancel-btn');

        if (cBtn) cBtn.onclick = () => { onConfirm(); this.hide(); };
        if (xBtn) xBtn.onclick = () => { onCancel(); this.hide(); };
    }
};
