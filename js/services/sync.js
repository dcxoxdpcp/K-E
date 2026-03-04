/**
 * js/services/sync.js - Sincronización Realtime con Supabase
 */

export const SyncService = {
    SUPABASE_URL: 'https://ogvkhtzindcybabbngqq.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ndmtodHppbmRjeWJhYmJuZ3FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMzM0NjUsImV4cCI6MjA4NjcwOTQ2NX0.I8h66AXH5JT30Y_JgQOY0vii7vqv2gdzbolW2_1pkmI',
    PROJECT_ID: 'default-project',
    client: null,
    enabled: false,
    isInitialLoad: true,
    lastUpdatedAt: null,
    presenceChannel: null,
    updateCallbacks: [],

    async init() {
        if (!window.supabase) {
            console.error("❌ SyncService: SDK de Supabase no detectado.");
            return;
        }

        this.client = window.supabase.createClient(this.SUPABASE_URL, this.SUPABASE_KEY);
        this.enabled = true;

        const { data } = await this.pull();
        this.isInitialLoad = false;
        return data;
    },

    async push(state, authorId) {
        if (!this.enabled || this.isInitialLoad) return { success: false };

        const { data, error } = await this.client.rpc('safe_update_state', {
            p_project_id: this.PROJECT_ID,
            p_new_state: state,
            p_expected_updated_at: this.lastUpdatedAt,
            p_author_id: authorId || 'system'
        });

        if (error) {
            console.error("☁️ SyncService Error:", error);
            return { success: false };
        }

        const result = (Array.isArray(data) ? data[0] : data) || {};
        if (result.success) {
            this.lastUpdatedAt = result.current_updated_at;
            return { success: true };
        } else {
            return {
                success: false,
                conflict: true,
                remoteState: result.current_state,
                remoteUpdatedAt: result.current_updated_at,
                remoteAuthorId: result.current_author_id
            };
        }
    },

    async pull() {
        if (!this.enabled) return { data: null };
        const { data, error } = await this.client
            .from('app_state')
            .select('state, updated_at, last_author_id')
            .eq('project_id', this.PROJECT_ID)
            .maybeSingle();

        if (error) {
            console.error("☁️ SyncService Pull Error:", error);
            return { data: null };
        }

        if (data) {
            this.lastUpdatedAt = data.updated_at;
        }
        return { data: data?.state };
    },

    trackPresence(userData, onPresenceChange) {
        if (!this.client || !userData) return;

        this.presenceChannel = this.client.channel('online-users', {
            config: { presence: { key: userData.id } }
        });

        this.presenceChannel
            .on('presence', { event: 'sync' }, () => onPresenceChange(this.presenceChannel.presenceState()))
            .on('presence', { event: 'join' }, () => onPresenceChange(this.presenceChannel.presenceState()))
            .on('presence', { event: 'leave' }, () => onPresenceChange(this.presenceChannel.presenceState()))
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await this.presenceChannel.track({
                        id: userData.id,
                        name: userData.name,
                        avatar: userData.avatar,
                    });
                }
            });
    },

    onUpdate(callback) {
        this.updateCallbacks.push(callback);
        if (this.updateCallbacks.length === 1) {
            this.listenToChanges();
        }
    },

    listenToChanges() {
        this.client
            .channel('public:app_state')
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'app_state',
                filter: `project_id=eq.${this.PROJECT_ID}`
            }, payload => {
                this.lastUpdatedAt = payload.new.updated_at;
                this.updateCallbacks.forEach(cb => cb(payload.new.state));
            })
            .subscribe();
    }
};
