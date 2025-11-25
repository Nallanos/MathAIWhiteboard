export interface UserProfile {
    id: string;
    email: string;
    displayName: string;
    avatarUrl?: string;
    locale: 'fr' | 'en';
}
export type SubscriptionPlan = 'free' | 'pro';
export interface SubscriptionState {
    plan: SubscriptionPlan;
    boardsPerDayLimit: number;
    aiMessagesPerDayLimit: number;
    renewsAt: string | null;
}
//# sourceMappingURL=user.d.ts.map