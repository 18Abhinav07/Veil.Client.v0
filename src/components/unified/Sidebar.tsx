"use client";

import { Home, List, Settings, Users, ReceiptText } from "lucide-react";

export type WalletTab = "dashboard" | "activity" | "contacts" | "requests" | "settings";

export interface SidebarBadges {
  contactRequests: number;
  paymentRequests: number;
  unreadNotifications: number;
  recoverable: number;
}

interface SidebarProps {
  currentTab: WalletTab;
  onChangeTab: (tab: WalletTab) => void;
  badges?: SidebarBadges;
  /** Legacy prop — kept so UnifiedWalletApp compiles without changes */
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
}

export default function Sidebar({
  currentTab,
  onChangeTab,
  badges,
}: SidebarProps) {
  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: Home },
    { id: "activity", label: "Activity", icon: List },
    { id: "contacts", label: "Contacts", icon: Users, badge: badges?.contactRequests ?? 0 },
    { id: "requests", label: "Requests", icon: ReceiptText, badge: badges?.paymentRequests ?? 0 },
    { id: "settings", label: "Settings", icon: Settings },
  ] as const;

  return (
    <aside
      className={`
        fixed bottom-0 left-0 top-0
        hidden md:flex flex-col
        border-r border-stone-200
        bg-stone-50/60 backdrop-blur-xl
        z-40
        w-14 hover:w-52
        transition-[width] duration-200 ease-in-out
        overflow-hidden
        group
      `}
    >
      {/* Header / Brand */}
      <div className="flex h-16 items-center shrink-0 px-3.5 overflow-hidden">
        <img
          src="/Veil_Bg_Removed_Logo.png"
          alt="Veil Logo"
          className="h-5 group-hover:h-8 w-auto object-contain transition-all duration-200 select-none mx-auto group-hover:ml-0 group-hover:mr-auto"
          draggable={false}
        />
      </div>

      {/* Navigation */}
      <nav className="mt-4 flex flex-1 flex-col gap-0.5 px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChangeTab(tab.id)}
              type="button"
              title={tab.label}
              className={`relative flex h-10 w-full items-center rounded-lg transition-all text-sm font-medium overflow-hidden px-3 ${
                active
                  ? "bg-white text-stone-950 shadow-sm ring-1 ring-stone-200"
                  : "text-stone-600 hover:bg-stone-100/60 hover:text-stone-900"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? "text-stone-950" : "text-stone-500"}`} />

              {/* Label — shown only when sidebar is expanded (group-hover) */}
              <span className="ml-3 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 animate-in fade-in">
                {tab.label}
              </span>

              {/* Badge — full count when expanded, dot when collapsed */}
              {"badge" in tab && tab.badge > 0 && (
                <>
                  {/* Expanded badge */}
                  <span className="ml-auto hidden group-hover:flex items-center rounded-full bg-stone-950 px-2 py-0.5 text-[10px] font-bold text-white">
                    {tab.badge}
                  </span>
                  {/* Collapsed dot */}
                  <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-stone-950 group-hover:hidden" />
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Network Status Footer */}
      <div className="p-3 shrink-0 border-t border-stone-200/40 overflow-hidden">
        {/* Collapsed: green dot only */}
        <div className="flex justify-center group-hover:hidden">
          <div className="h-2 w-2 rounded-full bg-emerald-500" title="Stellar Testnet Connected" />
        </div>
        {/* Expanded: label + dot */}
        <div className="hidden group-hover:block animate-in fade-in duration-150">
          <p className="text-[9px] font-bold uppercase tracking-wider text-stone-400">Network</p>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <p className="text-xs font-semibold text-stone-900 whitespace-nowrap">Stellar Testnet</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
