/**
 * js/services/productivity.js - Lógica de Métricas v3.1
 */

export const ProductivityService = {
    DONE_KEYWORDS: ['hecho', 'done', 'completado', 'terminado'],

    calculateMetrics(board) {
        if (!board) return { avgLeadTime: 'N/A', totalTasks: 0 };

        const doneColumnIds = (board.columns || [])
            .filter(col => this.DONE_KEYWORDS.includes(col.name.toLowerCase().trim()))
            .map(col => col.id);

        const leadTimes = [];
        let totalTasks = 0;

        (board.columns || []).forEach(col => {
            const tasksInCol = (col.tasks || []);
            totalTasks += tasksInCol.length;

            if (doneColumnIds.includes(col.id)) {
                tasksInCol.forEach(taskId => {
                    const task = board.tasks[taskId];
                    if (task && task.createdAt && task.history && task.history.length > 0) {
                        const lastMove = task.history[task.history.length - 1];
                        if (doneColumnIds.includes(lastMove.columnId)) {
                            const diffMs = new Date(lastMove.enteredAt) - new Date(task.createdAt);
                            if (diffMs > 0) leadTimes.push(diffMs / (1000 * 60 * 60 * 24));
                        }
                    }
                });
            }
        });

        const avgLeadTimeDays = leadTimes.length > 0 ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : 0;

        return {
            avgLeadTime: this.formatDays(avgLeadTimeDays),
            totalTasks
        };
    },

    formatDays(days) {
        if (days === 0) return 'N/A';
        if (days < 1) return `${(days * 24).toFixed(1)} horas`;
        return `${days.toFixed(1)} días`;
    }
};
