'use client';

import { useAuth } from '@/hooks/useAuth';
import { BarChart3, List, ShieldCheck, Calendar, Users, Shield } from "lucide-react";
import clsx from 'clsx';

interface DashboardNavProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
}

export default function DashboardNav({ activeTab, onTabChange }: DashboardNavProps) {
    const { role } = useAuth();
    const isAdmin = role === 'admin' || role === 'superadmin';

    const tabs = [
        { id: 'stats', label: 'Estadísticas', icon: BarChart3 },
        { id: 'matches', label: 'Mis Partidos', icon: Calendar },
        { id: 'users', label: 'Usuarios', icon: Users }, // New Tab
        { id: 'admin', label: 'Gestión', icon: Shield, adminOnly: true },
    ].filter(tab => !tab.adminOnly || isAdmin); // Filter out admin-only tabs if not admin

    return (
        <div className="flex items-center space-x-1 p-1 bg-gray-900/50 backdrop-blur-sm rounded-xl border border-gray-800 w-fit mx-auto mt-6 mb-8">
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                    <button
                        key={tab.id}
                        onClick={() => onTabChange(tab.id)}
                        className={clsx(
                            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                            isActive
                                ? 'bg-gradient-to-r from-green-500/20 to-blue-500/20 text-white shadow-lg border border-green-500/30'
                                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                        )}
                    >
                        <Icon className={clsx("w-4 h-4", isActive ? "text-green-400" : "text-gray-500")} />
                        {tab.label}
                    </button>
                );
            })}
        </div>
    );
}
