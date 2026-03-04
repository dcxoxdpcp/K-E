/**
 * js/ui/renderer_utils.js - Utilidades para renderizado
 */

export const escapeHTML = (str) => {
    if (typeof str !== 'string') return str;
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
};

export const showToast = (message, duration = 3000) => {
    const toast = document.getElementById('assist-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.display = 'block';
    toast.className = 'fixed right-5 bottom-5 bg-slate-800 text-white px-5 py-2.5 rounded-lg shadow-xl z-[9999] animate-bounce-subtle';
    setTimeout(() => { toast.style.display = 'none'; }, duration);
};
